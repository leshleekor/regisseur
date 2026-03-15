import type { AgentDefinition } from "@regisseur/core";

import {
  createInvalidAgentConfigError,
  createInvalidAgentRuntimeError,
} from "./errors.js";
import type { HttpConfig } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw createInvalidAgentConfigError(
      `HTTP config field ${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function parseHeaders(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw createInvalidAgentConfigError(
      "HTTP config field headers must be a string map",
    );
  }

  const entries = Object.entries(value);

  if (entries.some(([, entryValue]) => typeof entryValue !== "string")) {
    throw createInvalidAgentConfigError(
      "HTTP config field headers must contain only string values",
    );
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

function parseMethod(value: unknown): HttpConfig["method"] {
  if (value === undefined) {
    return "POST";
  }

  if (value !== "POST") {
    throw createInvalidAgentConfigError(
      "HTTP config field method must be POST",
    );
  }

  return value;
}

function parseTimeoutMs(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw createInvalidAgentConfigError(
      "HTTP config field timeoutMs must be a number",
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

function parseIncludeAgentName(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw createInvalidAgentConfigError(
      "HTTP config field includeAgentName must be a boolean",
    );
  }

  return value;
}

export function parseHttpConfig(agent: AgentDefinition): HttpConfig {
  if (agent.runtimeType !== "http") {
    throw createInvalidAgentRuntimeError(
      `Agent ${agent.agentId} does not use the http runtime`,
    );
  }

  if (!isPlainObject(agent.config)) {
    throw createInvalidAgentConfigError(
      `Agent ${agent.agentId} has an invalid HTTP config object`,
    );
  }

  return {
    url: parseRequiredString(agent.config.url, "url"),
    method: parseMethod(agent.config.method),
    headers: parseHeaders(agent.config.headers),
    timeoutMs: parseTimeoutMs(agent.config.timeoutMs),
    authToken: parseOptionalString(agent.config.authToken, "authToken"),
    includeAgentName: parseIncludeAgentName(agent.config.includeAgentName),
  };
}
