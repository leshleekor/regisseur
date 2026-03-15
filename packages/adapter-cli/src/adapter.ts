import type { AgentDefinition, Task } from "@regisseur/core";

import { parseCliConfig } from "./config.js";
import { isCliAdapterError } from "./errors.js";
import type { CliTransportPort } from "./ports.js";
import { createCliExecutionRequest } from "./request-mapper.js";
import { mapCliTransportResultToExecutionResult } from "./response-mapper.js";
import type { CliExecutionResult } from "./types.js";

function createConfigFailureResult(error: unknown): CliExecutionResult {
  if (isCliAdapterError(error)) {
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
        : "Unknown CLI adapter configuration error",
  };
}

function createTransportExceptionResult(error: unknown): CliExecutionResult {
  return {
    ok: false,
    reason: "TRANSPORT_ERROR",
    message:
      error instanceof Error ? error.message : "Unknown CLI transport error",
  };
}

export async function executeWithCliAdapter(
  task: Task,
  agent: AgentDefinition,
  transport: CliTransportPort,
): Promise<CliExecutionResult> {
  let request;

  try {
    const config = parseCliConfig(agent);
    request = createCliExecutionRequest(task, agent, config);
  } catch (error) {
    return createConfigFailureResult(error);
  }

  try {
    const transportResult = await transport.execute(request);

    return mapCliTransportResultToExecutionResult(transportResult);
  } catch (error) {
    return createTransportExceptionResult(error);
  }
}
