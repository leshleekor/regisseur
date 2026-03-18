import type { FastifyInstance } from "fastify";

import { badGateway, conflict, notFound } from "../errors/http-error.js";
import { injectUpstreamOutputs } from "../execution/inject-upstream-outputs.js";
import { selectPersistAndEnqueue } from "../execution/dispatch-persistence.js";
import {
  parseTaskBody,
  parseTaskDispatchBody,
  parseTasksQuery,
} from "../schemas/tasks.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

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
    const result = await selectPersistAndEnqueue(
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
        // In both cases, manual API redispatch is not a recovery path because
        // this route only accepts ready tasks. A future reconciler/outbox layer
        // is required to close those gaps.
        triggerSource: dispatchBody.triggerSource,
      },
    );

    if (result.ok) {
      return result;
    }

    if (result.reason === "ENQUEUE_FAILED") {
      throw badGateway(result.reason, result.message);
    }

    throw conflict(result.reason, result.message);
  });
}
