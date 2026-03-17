import type { Task, TaskStatus } from "@regisseur/core";

import { parseJsonValue, toIsoTimestamp } from "./shared.js";
import type { TaskRow, TaskRowInput } from "../types.js";

export function mapTaskToRowInput(task: Task): TaskRowInput {
  return {
    task_id: task.taskId,
    workflow_id: task.workflowId,
    title: task.title,
    payload: JSON.stringify(task.payload),
    status: task.status,
    assignee_agent_id: task.assigneeAgentId ?? null,
    retry_count: task.retryCount,
    task_template_id: task.taskTemplateId ?? null,
    loop_definition_id: task.loopDefinitionId ?? null,
    iteration: task.iteration ?? null,
    spawned_from_task_id: task.spawnedFromTaskId ?? null,
    concurrency_key: task.concurrencyKey ?? null,
    metadata: task.metadata ? JSON.stringify(task.metadata) : null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

export function mapTaskRowToDomain(row: TaskRow): Task {
  return {
    taskId: row.task_id,
    workflowId: row.workflow_id,
    title: row.title,
    payload: parseJsonValue<Record<string, unknown>>(row.payload, {}),
    status: row.status as TaskStatus,
    retryCount: row.retry_count,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    ...(row.assignee_agent_id !== null
      ? { assigneeAgentId: row.assignee_agent_id }
      : {}),
    ...(row.task_template_id !== null
      ? { taskTemplateId: row.task_template_id }
      : {}),
    ...(row.loop_definition_id !== null
      ? { loopDefinitionId: row.loop_definition_id }
      : {}),
    ...(row.iteration !== null ? { iteration: row.iteration } : {}),
    ...(row.spawned_from_task_id !== null
      ? { spawnedFromTaskId: row.spawned_from_task_id }
      : {}),
    ...(row.concurrency_key !== null
      ? { concurrencyKey: row.concurrency_key }
      : {}),
    ...(row.metadata !== null
      ? { metadata: parseJsonValue<Record<string, unknown>>(row.metadata, {}) }
      : {}),
  };
}
