import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import { validateTaskTemplateEdgesForInsert } from "../graph/task-template-edge-validation.js";
import {
  parseTaskTemplateEdgeBody,
  parseTaskTemplateEdgeBulkBody,
} from "../schemas/task-template-edges.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

export function registerTaskTemplateEdgeRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post("/task-template-edges", async (request) => {
    const edge = parseTaskTemplateEdgeBody(request.body);
    const [validatedEdge] = await validateTaskTemplateEdgesForInsert([edge], {
      taskTemplatesRepository: deps.taskTemplatesRepository,
      taskTemplateEdgesRepository: deps.taskTemplateEdgesRepository,
    });

    await deps.taskTemplateEdgesRepository.insert(validatedEdge);

    return validatedEdge;
  });

  app.post("/task-template-edges/bulk", async (request) => {
    const edges = parseTaskTemplateEdgeBulkBody(request.body);
    const validatedEdges = await validateTaskTemplateEdgesForInsert(edges, {
      taskTemplatesRepository: deps.taskTemplatesRepository,
      taskTemplateEdgesRepository: deps.taskTemplateEdgesRepository,
    });

    await deps.taskTemplateEdgesRepository.insertMany(validatedEdges);

    return validatedEdges;
  });

  app.get(
    "/workflow-definitions/:workflowDefinitionId/task-template-edges",
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

      const taskTemplates =
        await deps.taskTemplatesRepository.findByWorkflowDefinitionId(
          workflowDefinitionId,
        );

      if (taskTemplates.length === 0) {
        return [];
      }

      return deps.taskTemplateEdgesRepository.findAllByWorkflowDefinitionTaskTemplates(
        taskTemplates.map((taskTemplate) => taskTemplate.taskTemplateId),
      );
    },
  );

  app.get("/task-templates/:taskTemplateId/dependencies", async (request) => {
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

    return deps.taskTemplateEdgesRepository.findByToTaskTemplateId(
      taskTemplateId,
    );
  });

  app.get("/task-templates/:taskTemplateId/dependents", async (request) => {
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

    return deps.taskTemplateEdgesRepository.findByFromTaskTemplateId(
      taskTemplateId,
    );
  });

  app.delete(
    "/task-template-edges/:fromTaskTemplateId/:toTaskTemplateId",
    async (request, reply) => {
      const params = expectRecord(request.params, "params");
      const fromTaskTemplateId = expectString(
        params.fromTaskTemplateId,
        "fromTaskTemplateId",
      );
      const toTaskTemplateId = expectString(
        params.toTaskTemplateId,
        "toTaskTemplateId",
      );

      await deps.taskTemplateEdgesRepository.deleteEdge(
        fromTaskTemplateId,
        toTaskTemplateId,
      );

      return reply.status(204).send();
    },
  );
}
