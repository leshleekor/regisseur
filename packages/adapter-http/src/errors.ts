import type { HttpExecutionFailureReason } from "./types.js";

export class HttpAdapterError extends Error {
  constructor(
    public readonly reason: Extract<
      HttpExecutionFailureReason,
      "INVALID_AGENT_RUNTIME" | "INVALID_AGENT_CONFIG"
    >,
    message: string,
  ) {
    super(message);
    this.name = "HttpAdapterError";
  }
}

export function createInvalidAgentRuntimeError(message: string): Error {
  return new HttpAdapterError("INVALID_AGENT_RUNTIME", message);
}

export function createInvalidAgentConfigError(message: string): Error {
  return new HttpAdapterError("INVALID_AGENT_CONFIG", message);
}

export function isHttpAdapterError(error: unknown): error is HttpAdapterError {
  return error instanceof HttpAdapterError;
}
