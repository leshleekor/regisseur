import type { AgentDefinition } from "@regisseur/core";

import {
  createInvalidAgentConfigError,
  createInvalidAgentRuntimeError,
} from "./errors.js";
import type { OpenClawConfig } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    throw createInvalidAgentConfigError(
      `OpenClaw config field ${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function parseArgs(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw createInvalidAgentConfigError(
      "OpenClaw config field args must be a string array",
    );
  }

  return [...value];
}

function parseEnv(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw createInvalidAgentConfigError(
      "OpenClaw config field env must be a string map",
    );
  }

  const entries = Object.entries(value);

  if (entries.some(([, entryValue]) => typeof entryValue !== "string")) {
    throw createInvalidAgentConfigError(
      "OpenClaw config field env must contain only string values",
    );
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

function parseMode(value: unknown): OpenClawConfig["mode"] {
  if (value === undefined) {
    return "command";
  }

  if (value !== "command") {
    throw createInvalidAgentConfigError(
      "OpenClaw config field mode must be command",
    );
  }

  return value;
}

export function parseOpenClawConfig(agent: AgentDefinition): OpenClawConfig {
  if (agent.runtimeType !== "openclaw") {
    throw createInvalidAgentRuntimeError(
      `Agent ${agent.agentId} does not use the openclaw runtime`,
    );
  }

  if (!isPlainObject(agent.config)) {
    throw createInvalidAgentConfigError(
      `Agent ${agent.agentId} has an invalid OpenClaw config object`,
    );
  }

  const command = parseOptionalString(agent.config.command, "command");

  if (!command) {
    throw createInvalidAgentConfigError(
      "OpenClaw config field command is required",
    );
  }

  return {
    command,
    args: parseArgs(agent.config.args),
    workingDirectory: parseOptionalString(
      agent.config.workingDirectory,
      "workingDirectory",
    ),
    env: parseEnv(agent.config.env),
    agentName: parseOptionalString(agent.config.agentName, "agentName"),
    mode: parseMode(agent.config.mode),
  };
}
