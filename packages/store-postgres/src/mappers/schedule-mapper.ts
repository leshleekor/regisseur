import type {
  Schedule,
  ScheduleTargetType,
  ScheduleType,
} from "@regisseur/core";

import { toIsoTimestamp } from "./shared.js";
import type { ScheduleRow, ScheduleRowInput } from "../types.js";

export function mapScheduleToRowInput(schedule: Schedule): ScheduleRowInput {
  return {
    schedule_id: schedule.scheduleId,
    type: schedule.type,
    cron_expression: schedule.cronExpression ?? null,
    run_at: schedule.runAt ?? null,
    timezone: schedule.timezone ?? null,
    enabled: schedule.enabled,
    target_type: schedule.targetType,
    target_id: schedule.targetId,
    created_at: schedule.createdAt,
    updated_at: schedule.updatedAt,
  };
}

export function mapScheduleRowToDomain(row: ScheduleRow): Schedule {
  return {
    scheduleId: row.schedule_id,
    type: row.type as ScheduleType,
    enabled: row.enabled,
    targetType: row.target_type as ScheduleTargetType,
    targetId: row.target_id,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    ...(row.cron_expression !== null
      ? { cronExpression: row.cron_expression }
      : {}),
    ...(row.run_at !== null ? { runAt: toIsoTimestamp(row.run_at) } : {}),
    ...(row.timezone !== null ? { timezone: row.timezone } : {}),
  };
}
