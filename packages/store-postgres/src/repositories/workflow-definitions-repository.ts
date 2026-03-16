import type { WorkflowDefinition } from "@regisseur/core";

import {
  mapWorkflowDefinitionRowToDomain,
  mapWorkflowDefinitionToRowInput,
} from "../mappers/workflow-definition-mapper.js";
import type { Queryable, WorkflowDefinitionRow } from "../types.js";

export class PostgresWorkflowDefinitionsRepository {
  constructor(private readonly db: Queryable) {}

  async upsert(definition: WorkflowDefinition): Promise<void> {
    const row = mapWorkflowDefinitionToRowInput(definition);

    await this.db.query(
      `
        INSERT INTO workflow_definitions (
          workflow_definition_id,
          name,
          description,
          enabled,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7::timestamptz)
        ON CONFLICT (workflow_definition_id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          enabled = EXCLUDED.enabled,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.workflow_definition_id,
        row.name,
        row.description,
        row.enabled,
        row.metadata,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async findAll(): Promise<WorkflowDefinition[]> {
    const result = await this.db.query<WorkflowDefinitionRow>(
      `SELECT * FROM workflow_definitions ORDER BY created_at ASC`,
    );

    return result.rows.map(mapWorkflowDefinitionRowToDomain);
  }

  async findEnabled(): Promise<WorkflowDefinition[]> {
    const result = await this.db.query<WorkflowDefinitionRow>(
      `
        SELECT * FROM workflow_definitions
        WHERE enabled = TRUE
        ORDER BY created_at ASC
      `,
    );

    return result.rows.map(mapWorkflowDefinitionRowToDomain);
  }

  async findById(
    workflowDefinitionId: string,
  ): Promise<WorkflowDefinition | null> {
    const result = await this.db.query<WorkflowDefinitionRow>(
      `
        SELECT * FROM workflow_definitions
        WHERE workflow_definition_id = $1
      `,
      [workflowDefinitionId],
    );

    return result.rows[0]
      ? mapWorkflowDefinitionRowToDomain(result.rows[0])
      : null;
  }

  async deleteById(workflowDefinitionId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM workflow_definitions WHERE workflow_definition_id = $1`,
      [workflowDefinitionId],
    );
  }
}
