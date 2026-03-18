import type { CliExecutionFailureReason } from "./types.js";

export class CliAdapterError extends Error {
  constructor(
    public readonly reason: Extract<
      CliExecutionFailureReason,
      "INVALID_AGENT_RUNTIME" | "INVALID_AGENT_CONFIG"
    >,
    message: string,
  ) {
    super(message);
    this.name = "CliAdapterError";
  }
}

export function createInvalidAgentRuntimeError(message: string): Error {
  return new CliAdapterError("INVALID_AGENT_RUNTIME", message);
}

export function createInvalidAgentConfigError(message: string): Error {
  return new CliAdapterError("INVALID_AGENT_CONFIG", message);
}

export function isCliAdapterError(error: unknown): error is CliAdapterError {
  return error instanceof CliAdapterError;
}
