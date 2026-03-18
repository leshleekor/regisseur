import type { TaskEdge } from "../domain/task.js";

/**
 * Returns the unique prerequisite task ids for the given task.
 */
export function getDependencyTaskIds(
  taskId: string,
  edges: readonly TaskEdge[],
): string[] {
  const dependencyTaskIds = new Set<string>();

  for (const edge of edges) {
    if (edge.type === "depends_on" && edge.toTaskId === taskId) {
      dependencyTaskIds.add(edge.fromTaskId);
    }
  }

  return [...dependencyTaskIds];
}

/**
 * Returns the unique downstream task ids that depend on the given task.
 */
export function getDependentTaskIds(
  taskId: string,
  edges: readonly TaskEdge[],
): string[] {
  const dependentTaskIds = new Set<string>();

  for (const edge of edges) {
    if (edge.type === "depends_on" && edge.fromTaskId === taskId) {
      dependentTaskIds.add(edge.toTaskId);
    }
  }

  return [...dependentTaskIds];
}
