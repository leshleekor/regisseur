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
    ...(row.concurrency_key !== null
      ? { concurrencyKey: row.concurrency_key }
      : {}),
    ...(row.metadata !== null
      ? { metadata: parseJsonValue<Record<string, unknown>>(row.metadata, {}) }
      : {}),
  };
}
