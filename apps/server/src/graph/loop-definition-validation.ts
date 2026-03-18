import type {
  LoopDefinition,
  TaskTemplate,
  TaskTemplateEdge,
} from "@regisseur/core";

import { badRequest, conflict, notFound } from "../errors/http-error.js";
import type {
  LoopDefinitionsRepositoryLike,
  TaskTemplateEdgesRepositoryLike,
  TaskTemplatesRepositoryLike,
} from "../types.js";

export interface LoopDefinitionValidationRepositories {
  loopDefinitionsRepository: LoopDefinitionsRepositoryLike;
  taskTemplatesRepository: TaskTemplatesRepositoryLike;
  taskTemplateEdgesRepository: TaskTemplateEdgesRepositoryLike;
}

function detectCycle(edges: readonly TaskTemplateEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  for (const edge of edges) {
    const nextNodes = adjacency.get(edge.fromTaskTemplateId);

    if (nextNodes) {
      nextNodes.push(edge.toTaskTemplateId);
      continue;
    }

    adjacency.set(edge.fromTaskTemplateId, [edge.toTaskTemplateId]);
  }

  function visit(node: string): boolean {
    if (visiting.has(node)) {
      return true;
    }

    if (visited.has(node)) {
      return false;
    }

    visiting.add(node);

    for (const nextNode of adjacency.get(node) ?? []) {
      if (visit(nextNode)) {
        return true;
      }
    }

    visiting.delete(node);
    visited.add(node);

    return false;
  }

  for (const node of adjacency.keys()) {
    if (visit(node)) {
      return true;
    }
  }

  return false;
}

async function loadReferencedTaskTemplates(
  loopDefinition: LoopDefinition,
  repositories: LoopDefinitionValidationRepositories,
): Promise<void> {
  const referencedTaskTemplateIds = new Set<string>([
    loopDefinition.controllerTaskTemplateId,
    ...loopDefinition.entryTaskTemplateIds,
    ...loopDefinition.bodyTaskTemplateIds,
  ]);
  const loadedTaskTemplates = await Promise.all(
    Array.from(referencedTaskTemplateIds).map((taskTemplateId) =>
      repositories.taskTemplatesRepository.findById(taskTemplateId),
    ),
  );
  const missingTaskTemplate = loadedTaskTemplates.find(
    (taskTemplate): taskTemplate is null => taskTemplate === null,
  );

  if (missingTaskTemplate) {
    throw notFound("One or more loop task templates were not found");
  }

  const taskTemplates = loadedTaskTemplates.filter(
    (taskTemplate): taskTemplate is TaskTemplate => taskTemplate !== null,
  );

  for (const taskTemplate of taskTemplates) {
    if (
      taskTemplate.workflowDefinitionId !== loopDefinition.workflowDefinitionId
    ) {
      throw conflict(
        "CROSS_WORKFLOW_DEFINITION_LOOP_TEMPLATE",
        `Task template ${taskTemplate.taskTemplateId} does not belong to workflow definition ${loopDefinition.workflowDefinitionId}`,
      );
    }
  }
}

function assertLoopMembership(loopDefinition: LoopDefinition): void {
  const bodyTaskTemplateIds = new Set(loopDefinition.bodyTaskTemplateIds);

  if (loopDefinition.entryTaskTemplateIds.length === 0) {
    throw badRequest("entryTaskTemplateIds must not be empty");
  }

  if (!bodyTaskTemplateIds.has(loopDefinition.controllerTaskTemplateId)) {
    throw badRequest(
      "controllerTaskTemplateId must be included in bodyTaskTemplateIds",
    );
  }

  for (const entryTaskTemplateId of loopDefinition.entryTaskTemplateIds) {
    if (!bodyTaskTemplateIds.has(entryTaskTemplateId)) {
      throw badRequest(
        "entryTaskTemplateIds must be included in bodyTaskTemplateIds",
      );
    }
  }
}

function assertSingleLoopPerWorkflowDefinition(
  loopDefinition: LoopDefinition,
  existingLoopDefinition: LoopDefinition | null,
): void {
  if (
    existingLoopDefinition &&
    existingLoopDefinition.loopDefinitionId !== loopDefinition.loopDefinitionId
  ) {
    throw conflict(
      "LOOP_DEFINITION_ALREADY_EXISTS",
      `Workflow definition ${loopDefinition.workflowDefinitionId} already has a loop definition`,
    );
  }
}

function assertBodyStructure(
  loopDefinition: LoopDefinition,
  allWorkflowEdges: readonly TaskTemplateEdge[],
): void {
  const bodyTaskTemplateIds = new Set(loopDefinition.bodyTaskTemplateIds);
  const entryTaskTemplateIds = new Set(loopDefinition.entryTaskTemplateIds);
  const bodyEdges = allWorkflowEdges.filter(
    (edge) =>
      bodyTaskTemplateIds.has(edge.fromTaskTemplateId) &&
      bodyTaskTemplateIds.has(edge.toTaskTemplateId),
  );

  if (detectCycle(bodyEdges)) {
    throw conflict(
      "LOOP_BODY_CYCLE",
      `Loop body for ${loopDefinition.loopDefinitionId} must remain acyclic`,
    );
  }

  for (const edge of allWorkflowEdges) {
    const fromInBody = bodyTaskTemplateIds.has(edge.fromTaskTemplateId);
    const toInBody = bodyTaskTemplateIds.has(edge.toTaskTemplateId);

    if (toInBody && !fromInBody) {
      throw conflict(
        "INVALID_LOOP_EXTERNAL_INBOUND_EDGE",
        `Loop body task ${edge.toTaskTemplateId} cannot depend on external task template ${edge.fromTaskTemplateId}`,
      );
    }

    if (
      fromInBody &&
      !toInBody &&
      edge.fromTaskTemplateId !== loopDefinition.controllerTaskTemplateId
    ) {
      throw conflict(
        "INVALID_LOOP_EXTERNAL_DOWNSTREAM_EDGE",
        `Only controller task template ${loopDefinition.controllerTaskTemplateId} can connect loop body to external downstream tasks`,
      );
    }

    if (toInBody && entryTaskTemplateIds.has(edge.toTaskTemplateId)) {
      throw conflict(
        "INVALID_LOOP_ENTRY_DEPENDENCY",
        `Loop entry task template ${edge.toTaskTemplateId} must be a body-internal root`,
      );
    }
  }
}

export async function validateLoopDefinitionForUpsert(
  loopDefinition: LoopDefinition,
  repositories: LoopDefinitionValidationRepositories,
): Promise<LoopDefinition> {
  assertLoopMembership(loopDefinition);

  const [existingLoopDefinition, workflowTaskTemplates] = await Promise.all([
    repositories.loopDefinitionsRepository.findByWorkflowDefinitionId(
      loopDefinition.workflowDefinitionId,
    ),
    repositories.taskTemplatesRepository.findByWorkflowDefinitionId(
      loopDefinition.workflowDefinitionId,
    ),
  ]);

  assertSingleLoopPerWorkflowDefinition(loopDefinition, existingLoopDefinition);
  await loadReferencedTaskTemplates(loopDefinition, repositories);

  const workflowTaskTemplateIds = workflowTaskTemplates.map(
    (taskTemplate) => taskTemplate.taskTemplateId,
  );
  const allWorkflowEdges =
    workflowTaskTemplateIds.length === 0
      ? []
      : await repositories.taskTemplateEdgesRepository.findAllByWorkflowDefinitionTaskTemplates(
          workflowTaskTemplateIds,
        );

  assertBodyStructure(loopDefinition, allWorkflowEdges);

  return loopDefinition;
}
