import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import {
  parseWorkflowDefinitionBody,
  parseWorkflowDefinitionsQuery,
} from "../schemas/workflow-definitions.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

export function registerWorkflowDefinitionRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post("/workflow-definitions", async (request) => {
    const workflowDefinition = parseWorkflowDefinitionBody(request.body);

    await deps.workflowDefinitionsRepository.upsert(workflowDefinition);

    return workflowDefinition;
  });

  app.get("/workflow-definitions", async (request) => {
    const query = parseWorkflowDefinitionsQuery(request.query);

    if (query.enabled) {
      return deps.workflowDefinitionsRepository.findEnabled();
    }

    return deps.workflowDefinitionsRepository.findAll();
  });

  app.get("/workflow-definitions/:workflowDefinitionId", async (request) => {
    const params = expectRecord(request.params, "params");
    const workflowDefinitionId = expectString(
      params.workflowDefinitionId,
      "workflowDefinitionId",
    );
    const workflowDefinition =
      await deps.workflowDefinitionsRepository.findById(workflowDefinitionId);

    if (!workflowDefinition) {
      throw notFound(`Workflow definition ${workflowDefinitionId} not found`);
    }

    return workflowDefinition;
  });

  app.delete(
    "/workflow-definitions/:workflowDefinitionId",
    async (request, reply) => {
      const params = expectRecord(request.params, "params");
      const workflowDefinitionId = expectString(
        params.workflowDefinitionId,
        "workflowDefinitionId",
      );

      await deps.workflowDefinitionsRepository.deleteById(workflowDefinitionId);

      return reply.status(204).send();
    },
  );
}
