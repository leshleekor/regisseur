import type { Workflow, WorkflowStatus } from "@regisseur/core";

import { parseJsonValue, toIsoTimestamp } from "./shared.js";
import type { WorkflowRow, WorkflowRowInput } from "../types.js";

export function mapWorkflowToRowInput(workflow: Workflow): WorkflowRowInput {
  return {
    workflow_id: workflow.workflowId,
    name: workflow.name,
    status: workflow.status,
    metadata: workflow.metadata ? JSON.stringify(workflow.metadata) : null,
    created_at: workflow.createdAt,
    updated_at: workflow.updatedAt,
  };
}

export function mapWorkflowRowToDomain(row: WorkflowRow): Workflow {
  return {
    workflowId: row.workflow_id,
    name: row.name,
    status: row.status as WorkflowStatus,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    ...(row.metadata !== null
      ? {
          metadata: parseJsonValue<Record<string, unknown>>(row.metadata, {}),
        }
      : {}),
  };
}
