import type { LoopDefinition } from "@regisseur/core";

import {
  mapLoopDefinitionRowToDomain,
  mapLoopDefinitionToRowInput,
} from "../mappers/loop-definition-mapper.js";
import type { LoopDefinitionRow, Queryable } from "../types.js";

export class PostgresLoopDefinitionsRepository {
  constructor(private readonly db: Queryable) {}

  async upsert(loopDefinition: LoopDefinition): Promise<void> {
    const row = mapLoopDefinitionToRowInput(loopDefinition);

    await this.db.query(
      `
        INSERT INTO loop_definitions (
          loop_definition_id,
          workflow_definition_id,
          name,
          controller_task_template_id,
          entry_task_template_ids,
          body_task_template_ids,
          max_iterations,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::jsonb,
          $6::jsonb,
          $7,
          $8::timestamptz,
          $9::timestamptz
        )
        ON CONFLICT (loop_definition_id) DO UPDATE SET
          workflow_definition_id = EXCLUDED.workflow_definition_id,
          name = EXCLUDED.name,
          controller_task_template_id = EXCLUDED.controller_task_template_id,
          entry_task_template_ids = EXCLUDED.entry_task_template_ids,
          body_task_template_ids = EXCLUDED.body_task_template_ids,
          max_iterations = EXCLUDED.max_iterations,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.loop_definition_id,
        row.workflow_definition_id,
        row.name,
        row.controller_task_template_id,
        row.entry_task_template_ids,
        row.body_task_template_ids,
        row.max_iterations,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async findByWorkflowDefinitionId(
    workflowDefinitionId: string,
  ): Promise<LoopDefinition | null> {
    const result = await this.db.query<LoopDefinitionRow>(
      `
        SELECT * FROM loop_definitions
        WHERE workflow_definition_id = $1
      `,
      [workflowDefinitionId],
    );

    return result.rows[0] ? mapLoopDefinitionRowToDomain(result.rows[0]) : null;
  }

  async findById(loopDefinitionId: string): Promise<LoopDefinition | null> {
    const result = await this.db.query<LoopDefinitionRow>(
      `SELECT * FROM loop_definitions WHERE loop_definition_id = $1`,
      [loopDefinitionId],
    );

    return result.rows[0] ? mapLoopDefinitionRowToDomain(result.rows[0]) : null;
  }

  async deleteById(loopDefinitionId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM loop_definitions WHERE loop_definition_id = $1`,
      [loopDefinitionId],
    );
  }
}
