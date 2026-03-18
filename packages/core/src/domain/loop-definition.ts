import type { IsoTimestamp } from "./shared.js";

/**
 * LoopDefinition declares a bounded repeatable subgraph inside a workflow
 * definition. Runtime iterations are expanded from this authoring model.
 */
export interface LoopDefinition {
  /** Stable unique identifier for the loop definition. */
  loopDefinitionId: string;
  /** Identifier of the workflow definition that owns this loop. */
  workflowDefinitionId: string;
  /** Human-readable loop name for authoring and inspection. */
  name: string;
  /** Task template that decides whether the loop repeats or exits. */
  controllerTaskTemplateId: string;
  /** Body entry task templates used when a new iteration is created. */
  entryTaskTemplateIds: string[];
  /** All task templates that belong to the loop body. */
  bodyTaskTemplateIds: string[];
  /** Maximum number of iterations allowed for the loop. */
  maxIterations: number;
  /** Creation timestamp recorded when the loop definition is first persisted. */
  createdAt: IsoTimestamp;
  /** Last update timestamp for loop definition changes. */
  updatedAt: IsoTimestamp;
}
