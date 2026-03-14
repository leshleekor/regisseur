import type { AgentDefinition, AgentRuntimeType } from "@regisseur/core";

import { parseJsonValue } from "./shared.js";
import type { AgentRow, AgentRowInput } from "../types.js";

export function mapAgentToRowInput(agent: AgentDefinition): AgentRowInput {
  return {
    agent_id: agent.agentId,
    name: agent.name,
    runtime_type: agent.runtimeType,
    capabilities: JSON.stringify(agent.capabilities),
    enabled: agent.enabled,
    config: JSON.stringify(agent.config),
  };
}

export function mapAgentRowToDomain(row: AgentRow): AgentDefinition {
  return {
    agentId: row.agent_id,
    name: row.name,
    runtimeType: row.runtime_type as AgentRuntimeType,
    capabilities: parseJsonValue<string[]>(row.capabilities, []),
    enabled: row.enabled,
    config: parseJsonValue<Record<string, unknown>>(row.config, {}),
  };
}
