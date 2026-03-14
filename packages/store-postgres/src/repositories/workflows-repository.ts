import type { Workflow } from "@regisseur/core";

import {
  mapWorkflowRowToDomain,
  mapWorkflowToRowInput,
} from "../mappers/workflow-mapper.js";
import type { Queryable, WorkflowRow } from "../types.js";

export class PostgresWorkflowsRepository {
  constructor(private readonly db: Queryable) {}

  async insert(workflow: Workflow): Promise<void> {
    const row = mapWorkflowToRowInput(workflow);

    await this.db.query(
      `
        INSERT INTO workflows (
          workflow_id,
          name,
          status,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
      `,
      [
        row.workflow_id,
        row.name,
        row.status,
        row.metadata,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async upsert(workflow: Workflow): Promise<void> {
    const row = mapWorkflowToRowInput(workflow);

    await this.db.query(
      `
        INSERT INTO workflows (
          workflow_id,
          name,
          status,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
        ON CONFLICT (workflow_id) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.workflow_id,
        row.name,
        row.status,
        row.metadata,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async findById(workflowId: string): Promise<Workflow | null> {
    const result = await this.db.query<WorkflowRow>(
      `SELECT * FROM workflows WHERE workflow_id = $1`,
      [workflowId],
    );

    return result.rows[0] ? mapWorkflowRowToDomain(result.rows[0]) : null;
  }

  async findAll(): Promise<Workflow[]> {
    const result = await this.db.query<WorkflowRow>(
      `SELECT * FROM workflows ORDER BY created_at ASC`,
    );

    return result.rows.map(mapWorkflowRowToDomain);
  }

  async findByStatus(status: Workflow["status"]): Promise<Workflow[]> {
    const result = await this.db.query<WorkflowRow>(
      `SELECT * FROM workflows WHERE status = $1 ORDER BY created_at ASC`,
      [status],
    );

    return result.rows.map(mapWorkflowRowToDomain);
  }

  async deleteById(workflowId: string): Promise<void> {
    await this.db.query(`DELETE FROM workflows WHERE workflow_id = $1`, [
      workflowId,
    ]);
  }
}
