import type { DispatchTriggerSource, IsoTimestamp } from "./shared.js";

export const WORKFLOW_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

/**
 * Lifecycle states for a workflow instance.
 */
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/**
 * Workflow represents a running unit of orchestration that groups multiple
 * tasks under one lifecycle.
 */
export interface Workflow {
  /** Stable unique identifier for the workflow instance. */
  workflowId: string;
  /** Human-readable workflow name. */
  name: string;
  /** Current lifecycle state of the workflow as a whole. */
  status: WorkflowStatus;
  /** Creation timestamp recorded when the workflow is first persisted. */
  createdAt: IsoTimestamp;
  /** Last update timestamp for workflow state or metadata changes. */
  updatedAt: IsoTimestamp;
  /** Optional provenance back-reference to the definition this run came from. */
  workflowDefinitionId?: string;
  /** Trigger source that created this runtime workflow instance. */
  triggerSource?: DispatchTriggerSource;
  /** Optional schedule id that created this runtime workflow instance. */
  triggeredByScheduleId?: string;
  /** Optional workflow execution start timestamp. */
  startedAt?: IsoTimestamp;
  /** Optional contextual metadata such as initiator, tags, or source info. */
  metadata?: Record<string, unknown>;
}
