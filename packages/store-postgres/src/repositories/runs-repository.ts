import type { Run, RunStatus } from "@regisseur/core";

import { mapRunRowToDomain, mapRunToRowInput } from "../mappers/run-mapper.js";
import type { Queryable, RunRow } from "../types.js";

export class PostgresRunsRepository {
  constructor(private readonly db: Queryable) {}

  async insert(run: Run): Promise<void> {
    const row = mapRunToRowInput(run);

    await this.db.query(
      `
        INSERT INTO runs (
          run_id,
          task_id,
          agent_id,
          status,
          started_at,
          finished_at,
          output,
          error,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::timestamptz,
          $6::timestamptz,
          $7::jsonb,
          $8,
          $9::timestamptz,
          $10::timestamptz
        )
      `,
      [
        row.run_id,
        row.task_id,
        row.agent_id,
        row.status,
        row.started_at,
        row.finished_at,
        row.output,
        row.error,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async upsert(run: Run): Promise<void> {
    const row = mapRunToRowInput(run);

    await this.db.query(
      `
        INSERT INTO runs (
          run_id,
          task_id,
          agent_id,
          status,
          started_at,
          finished_at,
          output,
          error,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::timestamptz,
          $6::timestamptz,
          $7::jsonb,
          $8,
          $9::timestamptz,
          $10::timestamptz
        )
        ON CONFLICT (run_id) DO UPDATE SET
          task_id = EXCLUDED.task_id,
          agent_id = EXCLUDED.agent_id,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          finished_at = EXCLUDED.finished_at,
          output = EXCLUDED.output,
          error = EXCLUDED.error,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.run_id,
        row.task_id,
        row.agent_id,
        row.status,
        row.started_at,
        row.finished_at,
        row.output,
        row.error,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async findById(runId: string): Promise<Run | null> {
    const result = await this.db.query<RunRow>(
      `SELECT * FROM runs WHERE run_id = $1`,
      [runId],
    );

    return result.rows[0] ? mapRunRowToDomain(result.rows[0]) : null;
  }

  async findByTaskId(taskId: string): Promise<Run[]> {
    const result = await this.db.query<RunRow>(
      `SELECT * FROM runs WHERE task_id = $1 ORDER BY created_at ASC`,
      [taskId],
    );

    return result.rows.map(mapRunRowToDomain);
  }

  async findLatestSucceededByTaskId(taskId: string): Promise<Run | null> {
    const result = await this.db.query<RunRow>(
      `
        SELECT * FROM runs
        WHERE task_id = $1
          AND status = 'succeeded'
        ORDER BY finished_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `,
      [taskId],
    );

    return result.rows[0] ? mapRunRowToDomain(result.rows[0]) : null;
  }

  async findByAgentId(agentId: string): Promise<Run[]> {
    const result = await this.db.query<RunRow>(
      `SELECT * FROM runs WHERE agent_id = $1 ORDER BY created_at ASC`,
      [agentId],
    );

    return result.rows.map(mapRunRowToDomain);
  }

  async findByStatus(status: RunStatus): Promise<Run[]> {
    const result = await this.db.query<RunRow>(
      `SELECT * FROM runs WHERE status = $1 ORDER BY created_at ASC`,
      [status],
    );

    return result.rows.map(mapRunRowToDomain);
  }

  async deleteById(runId: string): Promise<void> {
    await this.db.query(`DELETE FROM runs WHERE run_id = $1`, [runId]);
  }
}
