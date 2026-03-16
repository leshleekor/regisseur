import type { Task, TaskStatus } from "@regisseur/core";

import {
  mapTaskRowToDomain,
  mapTaskToRowInput,
} from "../mappers/task-mapper.js";
import type { Queryable, TaskRow } from "../types.js";

export class PostgresTasksRepository {
  constructor(private readonly db: Queryable) {}

  async insert(task: Task): Promise<void> {
    const row = mapTaskToRowInput(task);

    await this.db.query(
      `
        INSERT INTO tasks (
          task_id,
          workflow_id,
          title,
          payload,
          status,
          assignee_agent_id,
          retry_count,
          task_template_id,
          concurrency_key,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4::jsonb,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::jsonb,
          $11::timestamptz,
          $12::timestamptz
        )
      `,
      [
        row.task_id,
        row.workflow_id,
        row.title,
        row.payload,
        row.status,
        row.assignee_agent_id,
        row.retry_count,
        row.task_template_id,
        row.concurrency_key,
        row.metadata,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async upsert(task: Task): Promise<void> {
    const row = mapTaskToRowInput(task);

    await this.db.query(
      `
        INSERT INTO tasks (
          task_id,
          workflow_id,
          title,
          payload,
          status,
          assignee_agent_id,
          retry_count,
          task_template_id,
          concurrency_key,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4::jsonb,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::jsonb,
          $11::timestamptz,
          $12::timestamptz
        )
        ON CONFLICT (task_id) DO UPDATE SET
          workflow_id = EXCLUDED.workflow_id,
          title = EXCLUDED.title,
          payload = EXCLUDED.payload,
          status = EXCLUDED.status,
          assignee_agent_id = EXCLUDED.assignee_agent_id,
          retry_count = EXCLUDED.retry_count,
          task_template_id = EXCLUDED.task_template_id,
          concurrency_key = EXCLUDED.concurrency_key,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.task_id,
        row.workflow_id,
        row.title,
        row.payload,
        row.status,
        row.assignee_agent_id,
        row.retry_count,
        row.task_template_id,
        row.concurrency_key,
        row.metadata,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async findById(taskId: string): Promise<Task | null> {
    const result = await this.db.query<TaskRow>(
      `SELECT * FROM tasks WHERE task_id = $1`,
      [taskId],
    );

    return result.rows[0] ? mapTaskRowToDomain(result.rows[0]) : null;
  }

  async findByWorkflowId(workflowId: string): Promise<Task[]> {
    const result = await this.db.query<TaskRow>(
      `SELECT * FROM tasks WHERE workflow_id = $1 ORDER BY created_at ASC`,
      [workflowId],
    );

    return result.rows.map(mapTaskRowToDomain);
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    const result = await this.db.query<TaskRow>(
      `SELECT * FROM tasks WHERE status = $1 ORDER BY created_at ASC`,
      [status],
    );

    return result.rows.map(mapTaskRowToDomain);
  }

  async findReadyTasks(): Promise<Task[]> {
    const result = await this.db.query<TaskRow>(
      `SELECT * FROM tasks WHERE status = 'ready' ORDER BY created_at ASC`,
    );

    return result.rows.map(mapTaskRowToDomain);
  }

  async deleteById(taskId: string): Promise<void> {
    await this.db.query(`DELETE FROM tasks WHERE task_id = $1`, [taskId]);
  }
}
