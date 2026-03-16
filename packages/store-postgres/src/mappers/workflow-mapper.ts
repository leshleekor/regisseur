import type { Workflow, WorkflowStatus } from "@regisseur/core";

import { parseJsonValue, toIsoTimestamp } from "./shared.js";
import type { WorkflowRow, WorkflowRowInput } from "../types.js";

export function mapWorkflowToRowInput(workflow: Workflow): WorkflowRowInput {
  return {
    workflow_id: workflow.workflowId,
    name: workflow.name,
    status: workflow.status,
    workflow_definition_id: workflow.workflowDefinitionId ?? null,
    trigger_source: workflow.triggerSource ?? null,
    triggered_by_schedule_id: workflow.triggeredByScheduleId ?? null,
    started_at: workflow.startedAt ?? null,
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
    ...(row.workflow_definition_id !== null
      ? {
          workflowDefinitionId: row.workflow_definition_id,
        }
      : {}),
    ...(row.trigger_source !== null
      ? {
          triggerSource: row.trigger_source as Workflow["triggerSource"],
        }
      : {}),
    ...(row.triggered_by_schedule_id !== null
      ? {
          triggeredByScheduleId: row.triggered_by_schedule_id,
        }
      : {}),
    ...(row.started_at !== null
      ? {
          startedAt: toIsoTimestamp(row.started_at),
        }
      : {}),
    ...(row.metadata !== null
      ? {
          metadata: parseJsonValue<Record<string, unknown>>(row.metadata, {}),
        }
      : {}),
  };
}
