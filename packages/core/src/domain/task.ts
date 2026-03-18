import type { IsoTimestamp } from "./shared.js";

export const TASK_STATUSES = [
  "pending",
  "ready",
  "queued",
  "running",
  "blocked",
  "waiting",
  "succeeded",
  "failed",
  "cancelled",
] as const;

/**
 * Lifecycle states for a task node in the workflow graph.
 */
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_EDGE_TYPES = ["depends_on"] as const;

/**
 * Supported graph edge types. MVP only models dependency edges.
 */
export type TaskEdgeType = (typeof TASK_EDGE_TYPES)[number];

export const TASK_GENERATION_SOURCES = [
  "definition",
  "loop",
  "dynamic",
] as const;

/** Supported provenance sources for runtime task creation. */
export type TaskGenerationSource = (typeof TASK_GENERATION_SOURCES)[number];

/**
 * Task represents the smallest executable unit in a workflow graph.
 */
export interface Task {
  /** Stable unique identifier for the task. */
  taskId: string;
  /** Identifier of the workflow that owns this task. */
  workflowId: string;
  /** Short human-readable task title. */
  title: string;
  /** Structured input payload that will eventually be sent to an agent. */
  payload: Record<string, unknown>;
  /** Current lifecycle state of the task. */
  status: TaskStatus;
  /**
   * Optional explicit assignee. When omitted, a dispatcher may choose an agent
   * based on capabilities or other policies.
   */
  assigneeAgentId?: string;
  /** Number of retries that have already been consumed for this task. */
  retryCount: number;
  /** Optional provenance back-reference to the template this task came from. */
  taskTemplateId?: string;
  /** Optional loop provenance when the task belongs to an expanded iteration. */
  loopDefinitionId?: string;
  /** Optional iteration number for loop body tasks. */
  iteration?: number;
  /**
   * Optional back-reference to the controller task that spawned this runtime
   * task during loop expansion.
   */
  spawnedFromTaskId?: string;
  /** Optional provenance source for how this runtime task was created. */
  generationSource?: TaskGenerationSource;
  /** Optional logical lock key used to prevent concurrent execution clashes. */
  concurrencyKey?: string;
  /** Creation timestamp recorded when the task is first persisted. */
  createdAt: IsoTimestamp;
  /** Last update timestamp for status, payload, or metadata changes. */
  updatedAt: IsoTimestamp;
  /** Optional task-level metadata such as labels, priority, or provenance. */
  metadata?: Record<string, unknown>;
}

/**
 * TaskEdge models the dependency relationship between two tasks in a workflow
 * graph.
 */
export interface TaskEdge {
  /** Identifier of the prerequisite task. */
  fromTaskId: string;
  /** Identifier of the downstream task that depends on the source task. */
  toTaskId: string;
  /** Relationship type between the two tasks. */
  type: TaskEdgeType;
  /** Whether the upstream task output should be injected into the downstream payload. */
  injectOutput?: boolean;
  /** Payload key used when injecting the upstream output into the downstream task. */
  outputMergeKey?: string;
}
