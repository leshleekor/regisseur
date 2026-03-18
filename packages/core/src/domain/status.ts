import type { RunStatus } from "./run.js";
import type { TaskStatus } from "./task.js";
import type { WorkflowStatus } from "./workflow.js";

export const TERMINAL_TASK_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
] as const;

export const RUNNABLE_TASK_STATUSES = ["ready"] as const;

export const TERMINAL_WORKFLOW_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
] as const;

export const TERMINAL_RUN_STATUSES = [
  "succeeded",
  "failed",
  "timeout",
  "cancelled",
] as const;

const terminalTaskStatuses: ReadonlySet<TaskStatus> = new Set<TaskStatus>(
  TERMINAL_TASK_STATUSES,
);
const runnableTaskStatuses: ReadonlySet<TaskStatus> = new Set<TaskStatus>(
  RUNNABLE_TASK_STATUSES,
);
const terminalWorkflowStatuses: ReadonlySet<WorkflowStatus> =
  new Set<WorkflowStatus>(TERMINAL_WORKFLOW_STATUSES);
const terminalRunStatuses: ReadonlySet<RunStatus> = new Set<RunStatus>(
  TERMINAL_RUN_STATUSES,
);

/**
 * Returns true when the task has reached a final state and should not continue
 * through the normal execution lifecycle.
 */
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return terminalTaskStatuses.has(status);
}

/**
 * Returns true when the workflow lifecycle has reached a final outcome.
 */
export function isTerminalWorkflowStatus(status: WorkflowStatus): boolean {
  return terminalWorkflowStatuses.has(status);
}

/**
 * Returns true when the run attempt has fully completed and will not emit
 * additional execution updates.
 */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return terminalRunStatuses.has(status);
}

/**
 * Returns true when the task is immediately eligible to be queued for
 * execution. This intentionally does not perform dependency evaluation.
 */
export function isRunnableTaskStatus(status: TaskStatus): boolean {
  return runnableTaskStatuses.has(status);
}
