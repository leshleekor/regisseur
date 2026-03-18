import type { TaskTemplate } from "@regisseur/core";

import {
  mapTaskTemplateRowToDomain,
  mapTaskTemplateToRowInput,
} from "../mappers/task-template-mapper.js";
import type { Queryable, TaskTemplateRow } from "../types.js";

export class PostgresTaskTemplatesRepository {
  constructor(private readonly db: Queryable) {}

  async upsert(template: TaskTemplate): Promise<void> {
    const row = mapTaskTemplateToRowInput(template);

    await this.db.query(
      `
        INSERT INTO task_templates (
          task_template_id,
          workflow_definition_id,
          title,
          payload,
          default_assignee_agent_id,
          retry_count,
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
          $8::jsonb,
          $9::timestamptz,
          $10::timestamptz
        )
        ON CONFLICT (task_template_id) DO UPDATE SET
          title = EXCLUDED.title,
          payload = EXCLUDED.payload,
          default_assignee_agent_id = EXCLUDED.default_assignee_agent_id,
          retry_count = EXCLUDED.retry_count,
          concurrency_key = EXCLUDED.concurrency_key,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.task_template_id,
        row.workflow_definition_id,
        row.title,
        row.payload,
        row.default_assignee_agent_id,
        row.retry_count,
        row.concurrency_key,
        row.metadata,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async findByWorkflowDefinitionId(
    workflowDefinitionId: string,
  ): Promise<TaskTemplate[]> {
    const result = await this.db.query<TaskTemplateRow>(
      `
        SELECT * FROM task_templates
        WHERE workflow_definition_id = $1
        ORDER BY created_at ASC
      `,
      [workflowDefinitionId],
    );

    return result.rows.map(mapTaskTemplateRowToDomain);
  }

  async findById(taskTemplateId: string): Promise<TaskTemplate | null> {
    const result = await this.db.query<TaskTemplateRow>(
      `SELECT * FROM task_templates WHERE task_template_id = $1`,
      [taskTemplateId],
    );

    return result.rows[0] ? mapTaskTemplateRowToDomain(result.rows[0]) : null;
  }

  async deleteById(taskTemplateId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM task_templates WHERE task_template_id = $1`,
      [taskTemplateId],
    );
  }
}
