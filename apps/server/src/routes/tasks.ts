import type { DispatchTriggerSource, Task, TaskStatus } from "@regisseur/core";
import type { FastifyInstance } from "fastify";

import { badGateway, conflict, notFound } from "../errors/http-error.js";
import { selectPersistAndEnqueue } from "../execution/dispatch-persistence.js";
import { injectUpstreamOutputs } from "../execution/inject-upstream-outputs.js";
import {
  updateWorkflowStatus,
  type UpdateWorkflowStatusOptions,
} from "../execution/workflow-status.js";
import {
  parseTaskBody,
  parseTaskDispatchBody,
  parseTaskResetBody,
  parseTasksQuery,
} from "../schemas/tasks.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

const RESETTABLE_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "failed",
  "cancelled",
]);
const CANCELLABLE_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "pending",
  "ready",
  "blocked",
  "waiting",
  "queued",
]);

type DispatchReadyTaskResult =
  | Awaited<ReturnType<typeof selectPersistAndEnqueue>>
  | {
      ok: false;
      taskId: string;
      workflowId: string;
      reason: "WORKFLOW_CANCELLED";
      message: string;
    };

async function dispatchReadyTask(
  task: Task,
  deps: ServerDependencies,
  options: {
    triggerSource: DispatchTriggerSource;
    updateWorkflowStatusOptions?: UpdateWorkflowStatusOptions;
  },
): Promise<DispatchReadyTaskResult> {
  const workflow = await deps.workflowsRepository.findById(task.workflowId);

  if (workflow?.status === "cancelled") {
    return {
      ok: false,
      taskId: task.taskId,
      workflowId: task.workflowId,
      reason: "WORKFLOW_CANCELLED",
      message: `Workflow ${task.workflowId} is cancelled and cannot dispatch new tasks`,
    };
  }

  const workflowTasks = await deps.tasksRepository.findByWorkflowId(
    task.workflowId,
  );
  const workflowEdges =
    workflowTasks.length === 0
      ? []
      : await deps.taskEdgesRepository.findAllByWorkflowTasks(
          workflowTasks.map((workflowTask) => workflowTask.taskId),
        );
  const injectedTask = await injectUpstreamOutputs(
    task,
    workflowEdges,
    deps.runsRepository,
  );
  const agents = await deps.agentsRepository.findAll();

  return selectPersistAndEnqueue(
    injectedTask,
    agents,
    {
      tasksRepository: deps.tasksRepository,
      workflowsRepository: deps.workflowsRepository,
    },
    deps.enqueuePort,
    {
      // NOTE: The selectPersistAndEnqueue sequence is:
      // save task -> update workflow -> enqueue.
      // Without a transaction/outbox, two failure windows remain:
      //
      // (1) workflow update fails: task=queued, workflow=old state, no job.
      // (2) enqueue fails: task=queued, workflow=running, no job.
      //
      // Dedicated reset/recovery endpoints reduce operational friction, but a
      // future reconciler/outbox layer is still required to close those gaps.
      triggerSource: options.triggerSource,
      updateWorkflowStatusImpl: (workflowId, repositories, now) =>
        updateWorkflowStatus(
          workflowId,
          repositories,
          now,
          options.updateWorkflowStatusOptions,
        ),
    },
  );
}

function throwDispatchFailure(result: Extract<DispatchReadyTaskResult, { ok: false }>): never {
  if (result.reason === "ENQUEUE_FAILED") {
    throw badGateway(result.reason, result.message);
  }

  throw conflict(result.reason, result.message);
}

async function cancelReadyTaskForCancelledWorkflow(
  taskId: string,
  deps: ServerDependencies,
): Promise<Task | null> {
  const latestTask = await deps.tasksRepository.findById(taskId);

  if (!latestTask || latestTask.status !== "ready") {
    return latestTask;
  }

  const now = new Date().toISOString();
  const cancelledTask: Task = {
    ...latestTask,
    status: "cancelled",
    updatedAt: now,
  };

  await deps.tasksRepository.upsert(cancelledTask);
  await updateWorkflowStatus(
    cancelledTask.workflowId,
    {
      tasksRepository: deps.tasksRepository,
      workflowsRepository: deps.workflowsRepository,
    },
    now,
    {
      preserveTerminalStatuses: ["cancelled"],
    },
  );

  return cancelledTask;
}

export function registerTaskRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post("/tasks", async (request) => {
    const task = parseTaskBody(request.body);

    await deps.tasksRepository.upsert(task);

    return task;
  });

  app.get("/tasks", async (request) => {
    const query = parseTasksQuery(request.query);

    if ("workflowId" in query) {
      return deps.tasksRepository.findByWorkflowId(query.workflowId);
    }

    return deps.tasksRepository.findByStatus(query.status);
  });

  app.get("/tasks/:taskId", async (request) => {
    const params = expectRecord(request.params, "params");
    const taskId = expectString(params.taskId, "taskId");
    const task = await deps.tasksRepository.findById(taskId);

    if (!task) {
      throw notFound(`Task ${taskId} not found`);
    }

    return task;
  });

  app.delete("/tasks/:taskId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const taskId = expectString(params.taskId, "taskId");

    await deps.tasksRepository.deleteById(taskId);

    return reply.status(204).send();
  });

  app.post("/tasks/:taskId/dispatch", async (request) => {
    const params = expectRecord(request.params, "params");
    const taskId = expectString(params.taskId, "taskId");
    const dispatchBody = parseTaskDispatchBody(request.body);
    const task = await deps.tasksRepository.findById(taskId);

    if (!task) {
      throw notFound(`Task ${taskId} not found`);
    }

    if (task.status !== "ready") {
      throw conflict(
        "TASK_NOT_READY",
        `Task ${taskId} is not ready for dispatch (status: ${task.status})`,
      );
    }

    const result = await dispatchReadyTask(task, deps, {
      triggerSource: dispatchBody.triggerSource,
    });

    if (result.ok) {
      return result;
    }

    throwDispatchFailure(result);
  });

  app.post("/tasks/:taskId/reset", async (request) => {
    const params = expectRecord(request.params, "params");
    const taskId = expectString(params.taskId, "taskId");
    const resetBody = parseTaskResetBody(request.body);
    const task = await deps.tasksRepository.findById(taskId);

    if (!task) {
      throw notFound(`Task ${taskId} not found`);
    }

    if (!RESETTABLE_TASK_STATUSES.has(task.status)) {
      throw conflict(
        "TASK_RECOVERY_NOT_ALLOWED",
        `Task ${taskId} cannot be reset from status ${task.status}`,
      );
    }

    const workflow = await deps.workflowsRepository.findById(task.workflowId);

    if (workflow?.status === "cancelled") {
      throw conflict(
        "TASK_RECOVERY_NOT_ALLOWED",
        `Task ${taskId} belongs to cancelled workflow ${task.workflowId}`,
      );
    }

    const now = new Date().toISOString();
    const readyTask: Task = {
      ...task,
      status: "ready",
      updatedAt: now,
    };

    await deps.tasksRepository.upsert(readyTask);
    await updateWorkflowStatus(
      readyTask.workflowId,
      {
        tasksRepository: deps.tasksRepository,
        workflowsRepository: deps.workflowsRepository,
      },
      now,
      {
        preserveTerminalStatuses: ["cancelled"],
      },
    );

    if (!resetBody.dispatch) {
      return {
        taskId: readyTask.taskId,
        workflowId: readyTask.workflowId,
        status: readyTask.status,
        dispatched: false,
        runEnqueued: false,
      };
    }

    const dispatchResult = await dispatchReadyTask(readyTask, deps, {
      triggerSource: resetBody.triggerSource,
      updateWorkflowStatusOptions: {
        preserveTerminalStatuses: ["cancelled"],
      },
    });

    if (dispatchResult.ok) {
      return {
        taskId: dispatchResult.taskId,
        workflowId: dispatchResult.workflowId,
        status: "queued" as const,
        dispatched: true,
        runEnqueued: true,
        agentId: dispatchResult.agentId,
      };
    }

    const latestTask =
      dispatchResult.reason === "WORKFLOW_CANCELLED"
        ? await cancelReadyTaskForCancelledWorkflow(taskId, deps)
        : await deps.tasksRepository.findById(taskId);

    return {
      taskId,
      workflowId: readyTask.workflowId,
      status: latestTask?.status ?? readyTask.status,
      dispatched: false,
      runEnqueued: false,
      dispatchFailure: {
        reason: dispatchResult.reason,
        message: dispatchResult.message,
      },
    };
  });

  app.post("/tasks/:taskId/cancel", async (request) => {
    const params = expectRecord(request.params, "params");
    const taskId = expectString(params.taskId, "taskId");
    const task = await deps.tasksRepository.findById(taskId);

    if (!task) {
      throw notFound(`Task ${taskId} not found`);
    }

    if (!CANCELLABLE_TASK_STATUSES.has(task.status)) {
      throw conflict(
        "TASK_CANCEL_NOT_ALLOWED",
        `Task ${taskId} cannot be cancelled from status ${task.status}`,
      );
    }

    const now = new Date().toISOString();
    const cancelledTask: Task = {
      ...task,
      status: "cancelled",
      updatedAt: now,
    };

    await deps.tasksRepository.upsert(cancelledTask);
    await updateWorkflowStatus(
      cancelledTask.workflowId,
      {
        tasksRepository: deps.tasksRepository,
        workflowsRepository: deps.workflowsRepository,
      },
      now,
    );

    return cancelledTask;
  });
}
