import type { AgentDefinition } from "@regisseur/core";

import {
  mapAgentRowToDomain,
  mapAgentToRowInput,
} from "../mappers/agent-mapper.js";
import type { AgentRow, Queryable } from "../types.js";

export class PostgresAgentsRepository {
  constructor(private readonly db: Queryable) {}

  async insert(agent: AgentDefinition): Promise<void> {
    const row = mapAgentToRowInput(agent);

    await this.db.query(
      `
        INSERT INTO agents (
          agent_id,
          name,
          runtime_type,
          capabilities,
          enabled,
          config
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)
      `,
      [
        row.agent_id,
        row.name,
        row.runtime_type,
        row.capabilities,
        row.enabled,
        row.config,
      ],
    );
  }

  async upsert(agent: AgentDefinition): Promise<void> {
    const row = mapAgentToRowInput(agent);

    await this.db.query(
      `
        INSERT INTO agents (
          agent_id,
          name,
          runtime_type,
          capabilities,
          enabled,
          config
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)
        ON CONFLICT (agent_id) DO UPDATE SET
          name = EXCLUDED.name,
          runtime_type = EXCLUDED.runtime_type,
          capabilities = EXCLUDED.capabilities,
          enabled = EXCLUDED.enabled,
          config = EXCLUDED.config,
          updated_at = NOW()
      `,
      [
        row.agent_id,
        row.name,
        row.runtime_type,
        row.capabilities,
        row.enabled,
        row.config,
      ],
    );
  }

  async findById(agentId: string): Promise<AgentDefinition | null> {
    const result = await this.db.query<AgentRow>(
      `SELECT * FROM agents WHERE agent_id = $1`,
      [agentId],
    );

    return result.rows[0] ? mapAgentRowToDomain(result.rows[0]) : null;
  }

  async findAll(): Promise<AgentDefinition[]> {
    const result = await this.db.query<AgentRow>(
      `SELECT * FROM agents ORDER BY created_at ASC`,
    );

    return result.rows.map(mapAgentRowToDomain);
  }

  async findEnabled(): Promise<AgentDefinition[]> {
    const result = await this.db.query<AgentRow>(
      `SELECT * FROM agents WHERE enabled = TRUE ORDER BY created_at ASC`,
    );

    return result.rows.map(mapAgentRowToDomain);
  }

  async deleteById(agentId: string): Promise<void> {
    await this.db.query(`DELETE FROM agents WHERE agent_id = $1`, [agentId]);
  }
}
