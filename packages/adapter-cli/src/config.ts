import type { AgentDefinition } from "@regisseur/core";

import {
  createInvalidAgentConfigError,
  createInvalidAgentRuntimeError,
} from "./errors.js";
import type { CliConfig } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw createInvalidAgentConfigError(
      `CLI config field ${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function parseOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseRequiredString(value, fieldName);
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
      "CLI config field args must be a string array",
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
      "CLI config field env must be a string map",
    );
  }

  const entries = Object.entries(value);

  if (entries.some(([, entryValue]) => typeof entryValue !== "string")) {
    throw createInvalidAgentConfigError(
      "CLI config field env must contain only string values",
    );
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

function parseInputMode(value: unknown): CliConfig["inputMode"] {
  if (value === undefined) {
    return "stdin";
  }

  if (value !== "stdin") {
    throw createInvalidAgentConfigError(
      "CLI config field inputMode must be stdin",
    );
  }

  return value;
}

export function parseCliConfig(agent: AgentDefinition): CliConfig {
  if (agent.runtimeType !== "cli") {
    throw createInvalidAgentRuntimeError(
      `Agent ${agent.agentId} does not use the cli runtime`,
    );
  }

  if (!isPlainObject(agent.config)) {
    throw createInvalidAgentConfigError(
      `Agent ${agent.agentId} has an invalid CLI config object`,
    );
  }

  return {
    command: parseRequiredString(agent.config.command, "command"),
    args: parseArgs(agent.config.args),
    workingDirectory: parseOptionalString(
      agent.config.workingDirectory,
      "workingDirectory",
    ),
    env: parseEnv(agent.config.env),
    inputMode: parseInputMode(agent.config.inputMode),
    agentName: parseOptionalString(agent.config.agentName, "agentName"),
  };
}
