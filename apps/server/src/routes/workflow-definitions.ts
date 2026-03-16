import type { FastifyInstance } from "fastify";

import { badGateway, notFound } from "../errors/http-error.js";
import { materializeWorkflowDefinitionRun } from "../definitions/materialize-workflow-definition-run.js";
import {
  parseWorkflowDefinitionBody,
  parseWorkflowDefinitionStartBody,
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

  app.post(
    "/workflow-definitions/:workflowDefinitionId/start",
    async (request) => {
      const params = expectRecord(request.params, "params");
      const workflowDefinitionId = expectString(
        params.workflowDefinitionId,
        "workflowDefinitionId",
      );
      const startBody = parseWorkflowDefinitionStartBody(request.body);

      try {
        const result = await materializeWorkflowDefinitionRun(
          workflowDefinitionId,
          {
            agentsRepository: deps.agentsRepository,
            workflowsRepository: deps.workflowsRepository,
            tasksRepository: deps.tasksRepository,
            taskEdgesRepository: deps.taskEdgesRepository,
            workflowDefinitionsRepository: deps.workflowDefinitionsRepository,
            taskTemplatesRepository: deps.taskTemplatesRepository,
            taskTemplateEdgesRepository: deps.taskTemplateEdgesRepository,
          },
          deps.enqueuePort,
          {
            triggerSource: "manual",
            requestedAt: startBody.requestedAt,
          },
        );

        return {
          workflowId: result.workflow.workflowId,
          workflowDefinitionId: result.workflow.workflowDefinitionId,
          status: result.workflow.status,
          enqueuedTaskIds: result.enqueuedTaskIds,
          createdTaskIds: result.createdTaskIds,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "Error" &&
          !(error as { statusCode?: unknown }).statusCode
        ) {
          throw badGateway("WORKFLOW_DEFINITION_START_FAILED", error.message);
        }

        throw error;
      }
    },
  );

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
