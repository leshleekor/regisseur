import type { AgentDefinition, Task } from "@regisseur/core";

import { parseHttpConfig } from "./config.js";
import { isHttpAdapterError } from "./errors.js";
import type { HttpTransportPort } from "./ports.js";
import { createHttpExecutionRequest } from "./request-mapper.js";
import { mapHttpTransportResultToExecutionResult } from "./response-mapper.js";
import type { HttpExecutionResult } from "./types.js";

function createConfigFailureResult(error: unknown): HttpExecutionResult {
  if (isHttpAdapterError(error)) {
    return {
      ok: false,
      reason: error.reason,
      message: error.message,
    };
  }

  return {
    ok: false,
    reason: "INVALID_AGENT_CONFIG",
    message:
      error instanceof Error
        ? error.message
        : "Unknown HTTP adapter configuration error",
  };
}

function createTransportExceptionResult(error: unknown): HttpExecutionResult {
  return {
    ok: false,
    reason: "TRANSPORT_ERROR",
    message:
      error instanceof Error ? error.message : "Unknown HTTP transport error",
  };
}

export async function executeWithHttpAdapter(
  task: Task,
  agent: AgentDefinition,
  transport: HttpTransportPort,
): Promise<HttpExecutionResult> {
  let request;

  try {
    const config = parseHttpConfig(agent);
    request = createHttpExecutionRequest(task, agent, config);
  } catch (error) {
    return createConfigFailureResult(error);
  }

  try {
    const transportResult = await transport.execute(request);

    return mapHttpTransportResultToExecutionResult(transportResult);
  } catch (error) {
    return createTransportExceptionResult(error);
  }
}
