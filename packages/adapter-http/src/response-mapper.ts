import type { HttpExecutionResult, HttpTransportResult } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBodyObject(
  bodyText: string,
): Record<string, unknown> | undefined {
  if (bodyText.length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;

    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function resolveExternalRunId(
  output: Record<string, unknown> | undefined,
): string | undefined {
  if (!output) {
    return undefined;
  }

  if (typeof output.externalRunId === "string") {
    return output.externalRunId;
  }

  if (typeof output.runId === "string") {
    return output.runId;
  }

  return undefined;
}

export function mapHttpTransportResultToExecutionResult(
  result: HttpTransportResult,
): HttpExecutionResult {
  if (!result.ok) {
    return {
      ok: false,
      reason: "TRANSPORT_ERROR",
      message: result.message,
      rawBodyText: result.bodyText,
    };
  }

  if (result.status < 200 || result.status >= 300) {
    return {
      ok: false,
      reason: "EXECUTION_FAILED",
      message: `HTTP execution failed with status ${result.status}`,
      rawBodyText: result.bodyText,
    };
  }

  const output = parseBodyObject(result.bodyText);

  return {
    ok: true,
    externalRunId: resolveExternalRunId(output),
    output,
    rawBodyText: result.bodyText,
  };
}
