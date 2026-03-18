import type { WorkflowDefinition } from "@regisseur/core";

import { parseJsonValue, toIsoTimestamp } from "./shared.js";
import type {
  WorkflowDefinitionRow,
  WorkflowDefinitionRowInput,
} from "../types.js";

export function mapWorkflowDefinitionToRowInput(
  definition: WorkflowDefinition,
): WorkflowDefinitionRowInput {
  return {
    workflow_definition_id: definition.workflowDefinitionId,
    name: definition.name,
    description: definition.description ?? null,
    enabled: definition.enabled,
    metadata: definition.metadata ? JSON.stringify(definition.metadata) : null,
    created_at: definition.createdAt,
    updated_at: definition.updatedAt,
  };
}

export function mapWorkflowDefinitionRowToDomain(
  row: WorkflowDefinitionRow,
): WorkflowDefinition {
  return {
    workflowDefinitionId: row.workflow_definition_id,
    name: row.name,
    enabled: row.enabled,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.metadata !== null
      ? {
          metadata: parseJsonValue<Record<string, unknown>>(row.metadata, {}),
        }
      : {}),
  };
}
