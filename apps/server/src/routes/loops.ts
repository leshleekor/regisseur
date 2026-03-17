import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import { validateLoopDefinitionForUpsert } from "../graph/loop-definition-validation.js";
import { parseLoopDefinitionBody } from "../schemas/loops.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

export function registerLoopRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post(
    "/workflow-definitions/:workflowDefinitionId/loops",
    async (request) => {
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

      const loopDefinition = parseLoopDefinitionBody(
        request.body,
        workflowDefinitionId,
      );
      const validatedLoopDefinition = await validateLoopDefinitionForUpsert(
        loopDefinition,
        {
          loopDefinitionsRepository: deps.loopDefinitionsRepository,
          taskTemplatesRepository: deps.taskTemplatesRepository,
          taskTemplateEdgesRepository: deps.taskTemplateEdgesRepository,
        },
      );

      await deps.loopDefinitionsRepository.upsert(validatedLoopDefinition);

      return validatedLoopDefinition;
    },
  );

  app.get(
    "/workflow-definitions/:workflowDefinitionId/loops",
    async (request) => {
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

      const loopDefinition =
        await deps.loopDefinitionsRepository.findByWorkflowDefinitionId(
          workflowDefinitionId,
        );

      return loopDefinition ? [loopDefinition] : [];
    },
  );

  app.get("/loops/:loopDefinitionId", async (request) => {
    const params = expectRecord(request.params, "params");
    const loopDefinitionId = expectString(
      params.loopDefinitionId,
      "loopDefinitionId",
    );
    const loopDefinition =
      await deps.loopDefinitionsRepository.findById(loopDefinitionId);

    if (!loopDefinition) {
      throw notFound(`Loop definition ${loopDefinitionId} not found`);
    }

    return loopDefinition;
  });

  app.delete("/loops/:loopDefinitionId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const loopDefinitionId = expectString(
      params.loopDefinitionId,
      "loopDefinitionId",
    );

    await deps.loopDefinitionsRepository.deleteById(loopDefinitionId);

    return reply.status(204).send();
  });
}
