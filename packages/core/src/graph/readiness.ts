import { isTerminalTaskStatus } from "../domain/status.js";
import type { Task, TaskEdge, TaskStatus } from "../domain/task.js";
import { getDependencyTaskIds } from "./dependency.js";

const NON_AUTOMATIC_READY_TASK_STATUSES: ReadonlySet<TaskStatus> =
  new Set<TaskStatus>(["queued", "running", "waiting"]);

/**
 * TaskReadinessEvaluation captures the readiness decision for one task without
 * mutating the task itself.
 */
export interface TaskReadinessEvaluation {
  /** Identifier of the task that was evaluated. */
  taskId: string;
  /** Unique prerequisite task ids derived from dependency edges. */
  dependencyTaskIds: string[];
  /** Dependency ids that are referenced by edges but missing from the task set. */
  missingDependencyTaskIds: string[];
  /**
   * Dependency ids that currently prevent the task from being ready. Missing
   * dependency tasks are also included here.
   */
  blockedByTaskIds: string[];
  /** True when the task should transition into ready from its current state. */
  canBecomeReady: boolean;
  /** True when the task should be treated as ready at the current moment. */
  isReady: boolean;
}

function createTaskLookup(tasks: readonly Task[]): ReadonlyMap<string, Task> {
  return new Map(tasks.map((task) => [task.taskId, task]));
}

function isTaskExcludedFromAutomaticReady(status: TaskStatus): boolean {
  return (
    isTerminalTaskStatus(status) ||
    NON_AUTOMATIC_READY_TASK_STATUSES.has(status)
  );
}

/**
 * Evaluates whether a single task can be considered ready based on its current
 * status and the success state of all depends_on prerequisites.
 *
 * Missing dependency task ids are treated as unsatisfied prerequisites rather
 * than throwing, so callers can surface configuration issues separately.
 */
export function evaluateTaskReadiness(
  task: Task,
  tasks: readonly Task[],
  edges: readonly TaskEdge[],
): TaskReadinessEvaluation {
  const tasksById = createTaskLookup(tasks);
  const dependencyTaskIds = getDependencyTaskIds(task.taskId, edges);
  const missingDependencyTaskIds: string[] = [];
  const blockedByTaskIds: string[] = [];

  for (const dependencyTaskId of dependencyTaskIds) {
    const dependencyTask = tasksById.get(dependencyTaskId);

    if (!dependencyTask) {
      missingDependencyTaskIds.push(dependencyTaskId);
      blockedByTaskIds.push(dependencyTaskId);
      continue;
    }

    if (dependencyTask.status !== "succeeded") {
      blockedByTaskIds.push(dependencyTaskId);
    }
  }

  const hasSatisfiedDependencies = blockedByTaskIds.length === 0;
  const isExcludedFromAutomaticReady = isTaskExcludedFromAutomaticReady(
    task.status,
  );
  const canBecomeReady =
    task.status !== "ready" &&
    !isExcludedFromAutomaticReady &&
    hasSatisfiedDependencies;
  const isReady =
    task.status === "ready"
      ? !isExcludedFromAutomaticReady && hasSatisfiedDependencies
      : canBecomeReady;

  return {
    taskId: task.taskId,
    dependencyTaskIds,
    missingDependencyTaskIds,
    blockedByTaskIds,
    canBecomeReady,
    isReady,
  };
}

/**
 * Returns true when the task can newly transition into ready from its current
 * status, without mutating the task object.
 */
export function canTaskBecomeReady(
  task: Task,
  tasks: readonly Task[],
  edges: readonly TaskEdge[],
): boolean {
  return evaluateTaskReadiness(task, tasks, edges).canBecomeReady;
}

/**
 * Returns the task ids that should currently be treated as ready.
 *
 * The input task order is preserved in the returned ids.
 */
export function getReadyTaskIds(
  tasks: readonly Task[],
  edges: readonly TaskEdge[],
): string[] {
  return tasks
    .filter((task) => evaluateTaskReadiness(task, tasks, edges).isReady)
    .map((task) => task.taskId);
}
