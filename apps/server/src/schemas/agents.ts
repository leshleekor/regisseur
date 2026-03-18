import { AGENT_RUNTIME_TYPES, type AgentDefinition } from "@regisseur/core";

import {
  expectBoolean,
  expectEnumValue,
  expectObject,
  expectRecord,
  expectString,
  expectStringArray,
  expectTrueQueryFlag,
} from "../utils/parse-body.js";

export interface AgentsQuery {
  enabled?: true;
}

export function parseAgentBody(value: unknown): AgentDefinition {
  const body = expectRecord(value, "body");

  return {
    agentId: expectString(body.agentId, "agentId"),
    name: expectString(body.name, "name"),
    runtimeType: expectEnumValue(
      body.runtimeType,
      AGENT_RUNTIME_TYPES,
      "runtimeType",
    ),
    capabilities: expectStringArray(body.capabilities, "capabilities"),
    enabled: expectBoolean(body.enabled, "enabled"),
    config: expectObject(body.config, "config"),
  };
}

export function parseAgentsQuery(value: unknown): AgentsQuery {
  const query = expectRecord(value ?? {}, "query");
  const enabled = expectTrueQueryFlag(query.enabled, "enabled");

  return enabled ? { enabled } : {};
}
