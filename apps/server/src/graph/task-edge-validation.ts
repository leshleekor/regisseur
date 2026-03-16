import type { Task, TaskEdge } from "@regisseur/core";

import { badRequest, conflict, notFound } from "../errors/http-error.js";
import type { TaskEdgesRepositoryLike, TasksRepositoryLike } from "../types.js";

export interface TaskEdgeValidationRepositories {
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
}

interface ValidatedTaskEdge {
  edge: TaskEdge;
  workflowId: string;
}

function edgeKey(edge: TaskEdge): string {
  return `${edge.fromTaskId}:${edge.toTaskId}:${edge.type}`;
}

function buildAdjacency(edges: readonly TaskEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    const fromEdges = adjacency.get(edge.fromTaskId);

    if (fromEdges) {
      fromEdges.push(edge.toTaskId);
      continue;
    }

    adjacency.set(edge.fromTaskId, [edge.toTaskId]);
  }

  return adjacency;
}

function detectCycle(edges: readonly TaskEdge[]): boolean {
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

async function loadTaskOrThrow(
  taskId: string,
  repositories: TaskEdgeValidationRepositories,
): Promise<Task> {
  const task = await repositories.tasksRepository.findById(taskId);

  if (!task) {
    throw notFound(`Task ${taskId} not found`);
  }

  return task;
}

async function validateOneTaskEdge(
  edge: TaskEdge,
  repositories: TaskEdgeValidationRepositories,
): Promise<ValidatedTaskEdge> {
  if (edge.fromTaskId === edge.toTaskId) {
    throw badRequest("Task edges cannot create self-dependencies");
  }

  const [fromTask, toTask] = await Promise.all([
    loadTaskOrThrow(edge.fromTaskId, repositories),
    loadTaskOrThrow(edge.toTaskId, repositories),
  ]);

  if (fromTask.workflowId !== toTask.workflowId) {
    throw conflict(
      "CROSS_WORKFLOW_TASK_EDGE",
      `Tasks ${edge.fromTaskId} and ${edge.toTaskId} belong to different workflows`,
    );
  }

  return {
    edge,
    workflowId: fromTask.workflowId,
  };
}

async function validateWorkflowEdgeBatch(
  workflowId: string,
  edges: readonly TaskEdge[],
  repositories: TaskEdgeValidationRepositories,
): Promise<void> {
  const tasks = await repositories.tasksRepository.findByWorkflowId(workflowId);
  const taskIds = tasks.map((task) => task.taskId);
  const existingEdges =
    taskIds.length === 0
      ? []
      : await repositories.taskEdgesRepository.findAllByWorkflowTasks(taskIds);
  const existingEdgeKeys = new Set(existingEdges.map(edgeKey));

  for (const edge of edges) {
    if (existingEdgeKeys.has(edgeKey(edge))) {
      throw conflict(
        "DUPLICATE_TASK_EDGE",
        `Task edge ${edge.fromTaskId} -> ${edge.toTaskId} already exists`,
      );
    }
  }

  if (detectCycle([...existingEdges, ...edges])) {
    throw conflict(
      "TASK_EDGE_CYCLE",
      `Task edge batch would create a cycle in workflow ${workflowId}`,
    );
  }
}

export async function validateTaskEdgesForInsert(
  edges: readonly TaskEdge[],
  repositories: TaskEdgeValidationRepositories,
): Promise<readonly TaskEdge[]> {
  const validatedEdges: ValidatedTaskEdge[] = [];
  const requestEdgeKeys = new Set<string>();

  for (const edge of edges) {
    const key = edgeKey(edge);

    if (requestEdgeKeys.has(key)) {
      throw conflict(
        "DUPLICATE_TASK_EDGE",
        `Task edge ${edge.fromTaskId} -> ${edge.toTaskId} is duplicated in the request`,
      );
    }

    requestEdgeKeys.add(key);
    validatedEdges.push(await validateOneTaskEdge(edge, repositories));
  }

  const workflowEdges = new Map<string, TaskEdge[]>();

  for (const validatedEdge of validatedEdges) {
    const batch = workflowEdges.get(validatedEdge.workflowId);

    if (batch) {
      batch.push(validatedEdge.edge);
      continue;
    }

    workflowEdges.set(validatedEdge.workflowId, [validatedEdge.edge]);
  }

  for (const [workflowId, workflowBatch] of workflowEdges) {
    await validateWorkflowEdgeBatch(workflowId, workflowBatch, repositories);
  }

  return validatedEdges.map((validatedEdge) => validatedEdge.edge);
}
