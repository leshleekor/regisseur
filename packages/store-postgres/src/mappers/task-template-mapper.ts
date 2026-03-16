import type { TaskTemplate } from "@regisseur/core";

import { parseJsonValue, toIsoTimestamp } from "./shared.js";
import type { TaskTemplateRow, TaskTemplateRowInput } from "../types.js";

export function mapTaskTemplateToRowInput(
  template: TaskTemplate,
): TaskTemplateRowInput {
  return {
    task_template_id: template.taskTemplateId,
    workflow_definition_id: template.workflowDefinitionId,
    title: template.title,
    payload: JSON.stringify(template.payload),
    default_assignee_agent_id: template.defaultAssigneeAgentId ?? null,
    retry_count: template.retryCount,
    concurrency_key: template.concurrencyKey ?? null,
    metadata: template.metadata ? JSON.stringify(template.metadata) : null,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}

export function mapTaskTemplateRowToDomain(row: TaskTemplateRow): TaskTemplate {
  return {
    taskTemplateId: row.task_template_id,
    workflowDefinitionId: row.workflow_definition_id,
    title: row.title,
    payload: parseJsonValue<Record<string, unknown>>(row.payload, {}),
    retryCount: row.retry_count,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    ...(row.default_assignee_agent_id !== null
      ? { defaultAssigneeAgentId: row.default_assignee_agent_id }
      : {}),
    ...(row.concurrency_key !== null
      ? { concurrencyKey: row.concurrency_key }
      : {}),
    ...(row.metadata !== null
      ? { metadata: parseJsonValue<Record<string, unknown>>(row.metadata, {}) }
      : {}),
  };
}
