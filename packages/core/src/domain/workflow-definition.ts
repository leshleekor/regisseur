import type { IsoTimestamp } from "./shared.js";

/**
 * WorkflowDefinition is a reusable workflow template that can later be
 * materialized into runtime workflow/task instances.
 */
export interface WorkflowDefinition {
  /** Stable unique identifier for the reusable workflow definition. */
  workflowDefinitionId: string;
  /** Human-readable workflow definition name. */
  name: string;
  /** Optional description for authoring and discovery. */
  description?: string;
  /** Whether the definition is enabled for future starts. */
  enabled: boolean;
  /** Creation timestamp recorded when the definition is first persisted. */
  createdAt: IsoTimestamp;
  /** Last update timestamp for definition changes. */
  updatedAt: IsoTimestamp;
  /** Optional contextual metadata for authoring. */
  metadata?: Record<string, unknown>;
}
