import type { AgentDefinition, Task } from "@regisseur/core";

import { parseOpenClawConfig } from "./config.js";
import { isOpenClawAdapterError } from "./errors.js";
import type { OpenClawTransportPort } from "./ports.js";
import { createOpenClawExecutionRequest } from "./request-mapper.js";
import { mapTransportResultToExecutionResult } from "./response-mapper.js";
import type { OpenClawExecutionResult } from "./types.js";

function createConfigFailureResult(error: unknown): OpenClawExecutionResult {
  if (isOpenClawAdapterError(error)) {
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
        : "Unknown OpenClaw adapter configuration error",
  };
}

function createTransportExceptionResult(
  error: unknown,
): OpenClawExecutionResult {
  return {
    ok: false,
    reason: "TRANSPORT_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "Unknown OpenClaw transport error",
  };
}

export async function executeWithOpenClawAdapter(
  task: Task,
  agent: AgentDefinition,
  transport: OpenClawTransportPort,
): Promise<OpenClawExecutionResult> {
  let request;

  try {
    const config = parseOpenClawConfig(agent);
    request = createOpenClawExecutionRequest(task, agent, config);
  } catch (error) {
    return createConfigFailureResult(error);
  }

  try {
    const transportResult = await transport.execute(request);

    return mapTransportResultToExecutionResult(transportResult);
  } catch (error) {
    return createTransportExceptionResult(error);
  }
}
