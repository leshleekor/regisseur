import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import {
  parseWorkflowBody,
  parseWorkflowsQuery,
} from "../schemas/workflows.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

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

  app.delete("/workflows/:workflowId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const workflowId = expectString(params.workflowId, "workflowId");

    await deps.workflowsRepository.deleteById(workflowId);

    return reply.status(204).send();
  });
}
