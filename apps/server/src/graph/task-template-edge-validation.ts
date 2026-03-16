import type { TaskTemplate, TaskTemplateEdge } from "@regisseur/core";

import { badRequest, conflict, notFound } from "../errors/http-error.js";
import type {
  TaskTemplateEdgesRepositoryLike,
  TaskTemplatesRepositoryLike,
} from "../types.js";

export interface TaskTemplateEdgeValidationRepositories {
  taskTemplatesRepository: TaskTemplatesRepositoryLike;
  taskTemplateEdgesRepository: TaskTemplateEdgesRepositoryLike;
}

interface ValidatedTaskTemplateEdge {
  edge: TaskTemplateEdge;
  workflowDefinitionId: string;
}

function edgeKey(edge: TaskTemplateEdge): string {
  return `${edge.fromTaskTemplateId}:${edge.toTaskTemplateId}:${edge.type}`;
}

function buildAdjacency(
  edges: readonly TaskTemplateEdge[],
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    const fromEdges = adjacency.get(edge.fromTaskTemplateId);

    if (fromEdges) {
      fromEdges.push(edge.toTaskTemplateId);
      continue;
    }

    adjacency.set(edge.fromTaskTemplateId, [edge.toTaskTemplateId]);
  }

  return adjacency;
}

function detectCycle(edges: readonly TaskTemplateEdge[]): boolean {
  const adjacency = buildAdjacency(edges);
  const visiting = new Set<string>();
  const visited = new Set<string>();

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

async function loadTaskTemplateOrThrow(
  taskTemplateId: string,
  repositories: TaskTemplateEdgeValidationRepositories,
): Promise<TaskTemplate> {
  const taskTemplate =
    await repositories.taskTemplatesRepository.findById(taskTemplateId);

  if (!taskTemplate) {
    throw notFound(`Task template ${taskTemplateId} not found`);
  }

  return taskTemplate;
}

async function validateOneTaskTemplateEdge(
  edge: TaskTemplateEdge,
  repositories: TaskTemplateEdgeValidationRepositories,
): Promise<ValidatedTaskTemplateEdge> {
  if (edge.fromTaskTemplateId === edge.toTaskTemplateId) {
    throw badRequest("Task template edges cannot create self-dependencies");
  }

  const [fromTaskTemplate, toTaskTemplate] = await Promise.all([
    loadTaskTemplateOrThrow(edge.fromTaskTemplateId, repositories),
    loadTaskTemplateOrThrow(edge.toTaskTemplateId, repositories),
  ]);

  if (
    fromTaskTemplate.workflowDefinitionId !==
    toTaskTemplate.workflowDefinitionId
  ) {
    throw conflict(
      "CROSS_WORKFLOW_DEFINITION_TASK_TEMPLATE_EDGE",
      `Task templates ${edge.fromTaskTemplateId} and ${edge.toTaskTemplateId} belong to different workflow definitions`,
    );
  }

  return {
    edge,
    workflowDefinitionId: fromTaskTemplate.workflowDefinitionId,
  };
}

async function validateWorkflowDefinitionEdgeBatch(
  workflowDefinitionId: string,
  edges: readonly TaskTemplateEdge[],
  repositories: TaskTemplateEdgeValidationRepositories,
): Promise<void> {
  const taskTemplates =
    await repositories.taskTemplatesRepository.findByWorkflowDefinitionId(
      workflowDefinitionId,
    );
  const taskTemplateIds = taskTemplates.map(
    (taskTemplate) => taskTemplate.taskTemplateId,
  );
  const existingEdges =
    taskTemplateIds.length === 0
      ? []
      : await repositories.taskTemplateEdgesRepository.findAllByWorkflowDefinitionTaskTemplates(
          taskTemplateIds,
        );
  const existingEdgeKeys = new Set(existingEdges.map(edgeKey));

  for (const edge of edges) {
    if (existingEdgeKeys.has(edgeKey(edge))) {
      throw conflict(
        "DUPLICATE_TASK_TEMPLATE_EDGE",
        `Task template edge ${edge.fromTaskTemplateId} -> ${edge.toTaskTemplateId} already exists`,
      );
    }
  }

  if (detectCycle([...existingEdges, ...edges])) {
    throw conflict(
      "TASK_TEMPLATE_EDGE_CYCLE",
      `Task template edge batch would create a cycle in workflow definition ${workflowDefinitionId}`,
    );
  }
}

export async function validateTaskTemplateEdgesForInsert(
  edges: readonly TaskTemplateEdge[],
  repositories: TaskTemplateEdgeValidationRepositories,
): Promise<readonly TaskTemplateEdge[]> {
  const validatedEdges: ValidatedTaskTemplateEdge[] = [];
  const requestEdgeKeys = new Set<string>();

  for (const edge of edges) {
    const key = edgeKey(edge);

    if (requestEdgeKeys.has(key)) {
      throw conflict(
        "DUPLICATE_TASK_TEMPLATE_EDGE",
        `Task template edge ${edge.fromTaskTemplateId} -> ${edge.toTaskTemplateId} is duplicated in the request`,
      );
    }

    requestEdgeKeys.add(key);
    validatedEdges.push(await validateOneTaskTemplateEdge(edge, repositories));
  }

  const workflowDefinitionEdges = new Map<string, TaskTemplateEdge[]>();

  for (const validatedEdge of validatedEdges) {
    const batch = workflowDefinitionEdges.get(
      validatedEdge.workflowDefinitionId,
    );

    if (batch) {
      batch.push(validatedEdge.edge);
      continue;
    }

    workflowDefinitionEdges.set(validatedEdge.workflowDefinitionId, [
      validatedEdge.edge,
    ]);
  }

  for (const [workflowDefinitionId, workflowBatch] of workflowDefinitionEdges) {
    await validateWorkflowDefinitionEdgeBatch(
      workflowDefinitionId,
      workflowBatch,
      repositories,
    );
  }

  return validatedEdges.map((validatedEdge) => validatedEdge.edge);
}
