import type { FastifyInstance } from "fastify";

import { badGateway, conflict, notFound } from "../errors/http-error.js";
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

    const agents = await deps.agentsRepository.findAll();
    const result = await deps.dispatcher.dispatch(task, agents, {
      triggerSource: dispatchBody.triggerSource,
    });

    if (result.ok) {
      // NOTE: agentId is not included in the queue payload
      // (TaskDispatchJobPayload). task.assigneeAgentId is the only way for the
      // execution worker to recover which agent was selected for this task.
      //
      // NOTE: At this point the job has already been enqueued. If the task
      // state update below fails, the job will remain in the queue with no
      // corresponding "queued" state in the database. This inconsistency is
      // intentional at this stage and will be addressed when a transactional
      // dispatch service is introduced in the execution lifecycle work.
      // Duplicate enqueue on client retry is prevented by the temporary
      // jobId = taskId policy at the enqueue port layer.
      await deps.tasksRepository.upsert({
        ...task,
        assigneeAgentId: result.agentId,
        status: "queued",
        updatedAt: new Date().toISOString(),
      });

      return result;
    }

    if (result.reason === "ENQUEUE_FAILED") {
      throw badGateway(result.reason, result.message);
    }

    throw conflict(result.reason, result.message);
  });
}
