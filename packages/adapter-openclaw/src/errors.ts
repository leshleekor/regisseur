import type { OpenClawExecutionFailureReason } from "./types.js";

export class OpenClawAdapterError extends Error {
  constructor(
    public readonly reason: Extract<
      OpenClawExecutionFailureReason,
      "INVALID_AGENT_RUNTIME" | "INVALID_AGENT_CONFIG"
    >,
    message: string,
  ) {
    super(message);
    this.name = "OpenClawAdapterError";
  }
}

export function createInvalidAgentRuntimeError(message: string): Error {
  return new OpenClawAdapterError("INVALID_AGENT_RUNTIME", message);
}

export function createInvalidAgentConfigError(message: string): Error {
  return new OpenClawAdapterError("INVALID_AGENT_CONFIG", message);
}

export function isOpenClawAdapterError(
  error: unknown,
): error is OpenClawAdapterError {
  return error instanceof OpenClawAdapterError;
}
