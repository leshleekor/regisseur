import type { IsoTimestamp } from "./shared.js";

export const RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "timeout",
  "cancelled",
] as const;

/**
 * Lifecycle states for a concrete task execution attempt.
 */
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * Run captures one execution attempt of a task. Multiple runs may belong to a
 * single task when retries occur.
 */
export interface Run {
  /** Stable unique identifier for this execution attempt. */
  runId: string;
  /** Identifier of the task being executed. */
  taskId: string;
  /** Identifier of the agent that performed this run. */
  agentId: string;
  /** Current lifecycle state of the execution attempt. */
  status: RunStatus;
  /** Timestamp captured when execution begins. */
  startedAt?: IsoTimestamp;
  /** Timestamp captured when execution finishes or aborts. */
  finishedAt?: IsoTimestamp;
  /** Optional structured result payload emitted by the execution. */
  output?: Record<string, unknown>;
  /** Optional error summary captured when the run fails. */
  error?: string;
  /** Creation timestamp recorded when the run row is first created. */
  createdAt: IsoTimestamp;
  /** Last update timestamp for status or execution result changes. */
  updatedAt: IsoTimestamp;
}
