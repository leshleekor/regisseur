import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import { validateTaskEdgesForInsert } from "../graph/task-edge-validation.js";
import {
  parseTaskEdgeBody,
  parseTaskEdgeBulkBody,
} from "../schemas/task-edges.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

export function registerTaskEdgeRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post("/task-edges", async (request) => {
    const edge = parseTaskEdgeBody(request.body);
    const [validatedEdge] = await validateTaskEdgesForInsert([edge], {
      tasksRepository: deps.tasksRepository,
      taskEdgesRepository: deps.taskEdgesRepository,
    });

    await deps.taskEdgesRepository.insert(validatedEdge);

    return validatedEdge;
  });

  app.post("/task-edges/bulk", async (request) => {
    const edges = parseTaskEdgeBulkBody(request.body);
    const validatedEdges = await validateTaskEdgesForInsert(edges, {
      tasksRepository: deps.tasksRepository,
      taskEdgesRepository: deps.taskEdgesRepository,
    });

    await deps.taskEdgesRepository.insertMany(validatedEdges);

    return validatedEdges;
  });

  app.get("/workflows/:workflowId/task-edges", async (request) => {
    const params = expectRecord(request.params, "params");
    const workflowId = expectString(params.workflowId, "workflowId");
    const workflow = await deps.workflowsRepository.findById(workflowId);

    if (!workflow) {
      throw notFound(`Workflow ${workflowId} not found`);
    }

    const tasks = await deps.tasksRepository.findByWorkflowId(workflowId);

    if (tasks.length === 0) {
      return [];
    }

    return deps.taskEdgesRepository.findAllByWorkflowTasks(
      tasks.map((task) => task.taskId),
    );
  });

  app.get("/tasks/:taskId/dependencies", async (request) => {
    const params = expectRecord(request.params, "params");
    const taskId = expectString(params.taskId, "taskId");
    const task = await deps.tasksRepository.findById(taskId);

    if (!task) {
      throw notFound(`Task ${taskId} not found`);
    }

    return deps.taskEdgesRepository.findByToTaskId(taskId);
  });

  app.get("/tasks/:taskId/dependents", async (request) => {
    const params = expectRecord(request.params, "params");
    const taskId = expectString(params.taskId, "taskId");
    const task = await deps.tasksRepository.findById(taskId);

    if (!task) {
      throw notFound(`Task ${taskId} not found`);
    }

    return deps.taskEdgesRepository.findByFromTaskId(taskId);
  });

  app.delete("/task-edges/:fromTaskId/:toTaskId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const fromTaskId = expectString(params.fromTaskId, "fromTaskId");
    const toTaskId = expectString(params.toTaskId, "toTaskId");

    await deps.taskEdgesRepository.deleteEdge(fromTaskId, toTaskId);

    return reply.status(204).send();
  });
}
