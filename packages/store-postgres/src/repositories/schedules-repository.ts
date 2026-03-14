import type { Schedule, ScheduleTargetType } from "@regisseur/core";

import {
  mapScheduleRowToDomain,
  mapScheduleToRowInput,
} from "../mappers/schedule-mapper.js";
import type { Queryable, ScheduleRow } from "../types.js";

function assertValidSchedule(schedule: Schedule): void {
  if (schedule.type === "once" && !schedule.runAt) {
    throw new Error(
      `Once schedule ${schedule.scheduleId} requires runAt to be defined`,
    );
  }

  if (schedule.type === "cron" && !schedule.cronExpression) {
    throw new Error(
      `Cron schedule ${schedule.scheduleId} requires cronExpression to be defined`,
    );
  }
}

export class PostgresSchedulesRepository {
  constructor(private readonly db: Queryable) {}

  async insert(schedule: Schedule): Promise<void> {
    assertValidSchedule(schedule);
    const row = mapScheduleToRowInput(schedule);

    await this.db.query(
      `
        INSERT INTO schedules (
          schedule_id,
          type,
          cron_expression,
          run_at,
          timezone,
          enabled,
          target_type,
          target_id,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4::timestamptz,
          $5,
          $6,
          $7,
          $8,
          $9::timestamptz,
          $10::timestamptz
        )
      `,
      [
        row.schedule_id,
        row.type,
        row.cron_expression,
        row.run_at,
        row.timezone,
        row.enabled,
        row.target_type,
        row.target_id,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async upsert(schedule: Schedule): Promise<void> {
    assertValidSchedule(schedule);
    const row = mapScheduleToRowInput(schedule);

    await this.db.query(
      `
        INSERT INTO schedules (
          schedule_id,
          type,
          cron_expression,
          run_at,
          timezone,
          enabled,
          target_type,
          target_id,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4::timestamptz,
          $5,
          $6,
          $7,
          $8,
          $9::timestamptz,
          $10::timestamptz
        )
        ON CONFLICT (schedule_id) DO UPDATE SET
          type = EXCLUDED.type,
          cron_expression = EXCLUDED.cron_expression,
          run_at = EXCLUDED.run_at,
          timezone = EXCLUDED.timezone,
          enabled = EXCLUDED.enabled,
          target_type = EXCLUDED.target_type,
          target_id = EXCLUDED.target_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.schedule_id,
        row.type,
        row.cron_expression,
        row.run_at,
        row.timezone,
        row.enabled,
        row.target_type,
        row.target_id,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async findById(scheduleId: string): Promise<Schedule | null> {
    const result = await this.db.query<ScheduleRow>(
      `SELECT * FROM schedules WHERE schedule_id = $1`,
      [scheduleId],
    );

    return result.rows[0] ? mapScheduleRowToDomain(result.rows[0]) : null;
  }

  async findEnabled(): Promise<Schedule[]> {
    const result = await this.db.query<ScheduleRow>(
      `
        SELECT * FROM schedules
        WHERE enabled = TRUE
        ORDER BY created_at ASC
      `,
    );

    return result.rows.map(mapScheduleRowToDomain);
  }

  async findByTarget(
    targetType: ScheduleTargetType,
    targetId: string,
  ): Promise<Schedule[]> {
    const result = await this.db.query<ScheduleRow>(
      `
        SELECT * FROM schedules
        WHERE target_type = $1 AND target_id = $2
        ORDER BY created_at ASC
      `,
      [targetType, targetId],
    );

    return result.rows.map(mapScheduleRowToDomain);
  }

  async deleteById(scheduleId: string): Promise<void> {
    await this.db.query(`DELETE FROM schedules WHERE schedule_id = $1`, [
      scheduleId,
    ]);
  }
}
