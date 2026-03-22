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
          workflow_definition_id,
          trigger_source,
          triggered_by_schedule_id,
          started_at,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::timestamptz,
          $8::jsonb,
          $9::timestamptz,
          $10::timestamptz
        )
      `,
      [
        row.workflow_id,
        row.name,
        row.status,
        row.workflow_definition_id,
        row.trigger_source,
        row.triggered_by_schedule_id,
        row.started_at,
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
          workflow_definition_id,
          trigger_source,
          triggered_by_schedule_id,
          started_at,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::timestamptz,
          $8::jsonb,
          $9::timestamptz,
          $10::timestamptz
        )
        ON CONFLICT (workflow_id) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          workflow_definition_id = EXCLUDED.workflow_definition_id,
          trigger_source = EXCLUDED.trigger_source,
          triggered_by_schedule_id = EXCLUDED.triggered_by_schedule_id,
          started_at = EXCLUDED.started_at,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.workflow_id,
        row.name,
        row.status,
        row.workflow_definition_id,
        row.trigger_source,
        row.triggered_by_schedule_id,
        row.started_at,
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

  async purgeById(workflowId: string): Promise<{
    workflowDeleted: boolean;
    deletedTaskCount: number;
    deletedRunCount: number;
    deletedTaskEdgeCount: number;
  }> {
    const result = await this.db.query(
      `
        WITH workflow_tasks AS (
          SELECT task_id
          FROM tasks
          WHERE workflow_id = $1
        ),
        deleted_task_edges AS (
          DELETE FROM task_edges
          WHERE from_task_id IN (SELECT task_id FROM workflow_tasks)
             OR to_task_id IN (SELECT task_id FROM workflow_tasks)
          RETURNING 1
        ),
        deleted_runs AS (
          DELETE FROM runs
          WHERE task_id IN (SELECT task_id FROM workflow_tasks)
          RETURNING 1
        ),
        deleted_tasks AS (
          DELETE FROM tasks
          WHERE workflow_id = $1
          RETURNING 1
        ),
        deleted_workflow AS (
          DELETE FROM workflows
          WHERE workflow_id = $1
          RETURNING 1
        )
        SELECT
          EXISTS (SELECT 1 FROM deleted_workflow) AS workflow_deleted,
          (SELECT COUNT(*)::int FROM deleted_tasks) AS deleted_task_count,
          (SELECT COUNT(*)::int FROM deleted_runs) AS deleted_run_count,
          (SELECT COUNT(*)::int FROM deleted_task_edges) AS deleted_task_edge_count
      `,
      [workflowId],
    );
    const row = result.rows[0] as
      | {
          workflow_deleted: boolean;
          deleted_task_count: number;
          deleted_run_count: number;
          deleted_task_edge_count: number;
        }
      | undefined;

    if (!row) {
      return {
        workflowDeleted: false,
        deletedTaskCount: 0,
        deletedRunCount: 0,
        deletedTaskEdgeCount: 0,
      };
    }

    return {
      workflowDeleted: row.workflow_deleted,
      deletedTaskCount: row.deleted_task_count,
      deletedRunCount: row.deleted_run_count,
      deletedTaskEdgeCount: row.deleted_task_edge_count,
    };
  }
}
