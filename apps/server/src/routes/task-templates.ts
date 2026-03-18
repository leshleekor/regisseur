import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import { parseTaskTemplateBody } from "../schemas/task-templates.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

export function registerTaskTemplateRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post(
    "/workflow-definitions/:workflowDefinitionId/task-templates",
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

      const taskTemplate = parseTaskTemplateBody(
        request.body,
        workflowDefinitionId,
      );

      await deps.taskTemplatesRepository.upsert(taskTemplate);

      return taskTemplate;
    },
  );

  app.get(
    "/workflow-definitions/:workflowDefinitionId/task-templates",
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

      return deps.taskTemplatesRepository.findByWorkflowDefinitionId(
        workflowDefinitionId,
      );
    },
  );

  app.get("/task-templates/:taskTemplateId", async (request) => {
    const params = expectRecord(request.params, "params");
    const taskTemplateId = expectString(
      params.taskTemplateId,
      "taskTemplateId",
    );
    const taskTemplate =
      await deps.taskTemplatesRepository.findById(taskTemplateId);

    if (!taskTemplate) {
      throw notFound(`Task template ${taskTemplateId} not found`);
    }

    return taskTemplate;
  });

  app.delete("/task-templates/:taskTemplateId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const taskTemplateId = expectString(
      params.taskTemplateId,
      "taskTemplateId",
    );

    await deps.taskTemplatesRepository.deleteById(taskTemplateId);

    return reply.status(204).send();
  });
}
