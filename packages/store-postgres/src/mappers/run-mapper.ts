import type { Run, RunStatus } from "@regisseur/core";

import { parseJsonValue, toIsoTimestamp } from "./shared.js";
import type { RunRow, RunRowInput } from "../types.js";

export function mapRunToRowInput(run: Run): RunRowInput {
  return {
    run_id: run.runId,
    task_id: run.taskId,
    agent_id: run.agentId,
    status: run.status,
    started_at: run.startedAt ?? null,
    finished_at: run.finishedAt ?? null,
    output: run.output ? JSON.stringify(run.output) : null,
    error: run.error ?? null,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
  };
}

export function mapRunRowToDomain(row: RunRow): Run {
  return {
    runId: row.run_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    status: row.status as RunStatus,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    ...(row.started_at !== null
      ? { startedAt: toIsoTimestamp(row.started_at) }
      : {}),
    ...(row.finished_at !== null
      ? { finishedAt: toIsoTimestamp(row.finished_at) }
      : {}),
    ...(row.output !== null
      ? { output: parseJsonValue<Record<string, unknown>>(row.output, {}) }
      : {}),
    ...(row.error !== null ? { error: row.error } : {}),
  };
}
