import type { IsoTimestamp } from "./shared.js";

export const TASK_TEMPLATE_EDGE_TYPES = ["depends_on"] as const;

/**
 * Supported dependency edge types between reusable task templates.
 */
export type TaskTemplateEdgeType = (typeof TASK_TEMPLATE_EDGE_TYPES)[number];

/**
 * TaskTemplate describes a reusable unit of work inside a workflow definition.
 */
export interface TaskTemplate {
  /** Stable unique identifier for the reusable task template. */
  taskTemplateId: string;
  /** Identifier of the workflow definition that owns this template. */
  workflowDefinitionId: string;
  /** Short human-readable task title. */
  title: string;
  /** Structured input that will be copied into runtime tasks on start. */
  payload: Record<string, unknown>;
  /** Optional default assignee copied into runtime tasks. */
  defaultAssigneeAgentId?: string;
  /** Initial retry count copied into runtime tasks. */
  retryCount: number;
  /** Optional concurrency lock key copied into runtime tasks. */
  concurrencyKey?: string;
  /** Creation timestamp recorded when the template is first persisted. */
  createdAt: IsoTimestamp;
  /** Last update timestamp for template changes. */
  updatedAt: IsoTimestamp;
  /** Optional template-level metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * TaskTemplateEdge models dependency relationships between reusable task
 * templates inside a workflow definition.
 */
export interface TaskTemplateEdge {
  /** Identifier of the prerequisite task template. */
  fromTaskTemplateId: string;
  /** Identifier of the downstream task template. */
  toTaskTemplateId: string;
  /** Relationship type between the two templates. */
  type: TaskTemplateEdgeType;
  /** Whether the upstream template output should be injected at runtime. */
  injectOutput?: boolean;
  /** Runtime payload key used for injecting the upstream output. */
  outputMergeKey?: string;
}
