import {
  isTerminalTaskStatus,
  isTerminalWorkflowStatus,
  type Task,
  type Workflow,
} from "@regisseur/core";
import type { FastifyInstance } from "fastify";

import { conflict, notFound } from "../errors/http-error.js";
import {
  parseWorkflowBody,
  parseWorkflowsQuery,
} from "../schemas/workflows.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

function collectWorkflowCancellationPlan(
  tasks: readonly Task[],
  now: string,
): {
  cancelledTasks: Task[];
  skippedRunningTaskIds: string[];
} {
  const cancelledTasks: Task[] = [];
  const skippedRunningTaskIds: string[] = [];

  for (const task of tasks) {
    if (isTerminalTaskStatus(task.status)) {
      continue;
    }

    if (task.status === "running") {
      skippedRunningTaskIds.push(task.taskId);
      continue;
    }

    cancelledTasks.push({
      ...task,
      status: "cancelled",
      updatedAt: now,
    });
  }

  return {
    cancelledTasks,
    skippedRunningTaskIds,
  };
}

export function registerWorkflowRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post("/workflows", async (request) => {
    const workflow = parseWorkflowBody(request.body);

    await deps.workflowsRepository.upsert(workflow);

    return workflow;
  });

  app.get("/workflows", async (request) => {
    const query = parseWorkflowsQuery(request.query);

    if (query.status !== undefined) {
      return deps.workflowsRepository.findByStatus(query.status);
    }

    return deps.workflowsRepository.findAll();
  });

  app.get("/workflows/:workflowId", async (request) => {
    const params = expectRecord(request.params, "params");
    const workflowId = expectString(params.workflowId, "workflowId");
    const workflow = await deps.workflowsRepository.findById(workflowId);

    if (!workflow) {
      throw notFound(`Workflow ${workflowId} not found`);
    }

    return workflow;
  });

  app.get("/workflows/:workflowId/tasks", async (request) => {
    const params = expectRecord(request.params, "params");
    const workflowId = expectString(params.workflowId, "workflowId");
    const workflow = await deps.workflowsRepository.findById(workflowId);

    if (!workflow) {
      throw notFound(`Workflow ${workflowId} not found`);
    }

    return deps.tasksRepository.findByWorkflowId(workflowId);
  });

  app.post("/workflows/:workflowId/cancel", async (request) => {
    const params = expectRecord(request.params, "params");
    const workflowId = expectString(params.workflowId, "workflowId");
    const workflow = await deps.workflowsRepository.findById(workflowId);

    if (!workflow) {
      throw notFound(`Workflow ${workflowId} not found`);
    }

    if (isTerminalWorkflowStatus(workflow.status)) {
      throw conflict(
        "WORKFLOW_CANCEL_NOT_ALLOWED",
        `Workflow ${workflowId} cannot be cancelled from status ${workflow.status}`,
      );
    }

    const now = new Date().toISOString();
    const tasks = await deps.tasksRepository.findByWorkflowId(workflowId);
    const { cancelledTasks, skippedRunningTaskIds } =
      collectWorkflowCancellationPlan(tasks, now);

    await Promise.all(cancelledTasks.map((task) => deps.tasksRepository.upsert(task)));

    const cancelledWorkflow: Workflow = {
      ...workflow,
      status: "cancelled",
      updatedAt: now,
    };

    await deps.workflowsRepository.upsert(cancelledWorkflow);

    return {
      workflowId,
      status: "cancelled" as const,
      cancelledTaskIds: cancelledTasks.map((task) => task.taskId),
      skippedRunningTaskIds,
    };
  });

  app.post("/workflows/:workflowId/purge", async (request) => {
    const params = expectRecord(request.params, "params");
    const workflowId = expectString(params.workflowId, "workflowId");
    const workflow = await deps.workflowsRepository.findById(workflowId);

    if (!workflow) {
      throw notFound(`Workflow ${workflowId} not found`);
    }

    if (!isTerminalWorkflowStatus(workflow.status)) {
      throw conflict(
        "WORKFLOW_PURGE_NOT_ALLOWED",
        `Workflow ${workflowId} must be terminal before purge (status: ${workflow.status})`,
      );
    }

    if (!deps.workflowsRepository.purgeById) {
      throw new Error("workflowsRepository.purgeById is not configured");
    }

    const result = await deps.workflowsRepository.purgeById(workflowId);

    return {
      workflowId,
      purged: result.workflowDeleted,
      deletedTaskCount: result.deletedTaskCount,
      deletedRunCount: result.deletedRunCount,
      deletedTaskEdgeCount: result.deletedTaskEdgeCount,
    };
  });

  app.delete("/workflows/:workflowId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const workflowId = expectString(params.workflowId, "workflowId");

    await deps.workflowsRepository.deleteById(workflowId);

    return reply.status(204).send();
  });
}
