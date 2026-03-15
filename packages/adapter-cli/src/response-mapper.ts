import type { CliExecutionResult, CliTransportResult } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOutput(stdout: string): Record<string, unknown> | undefined {
  if (stdout.length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stdout) as unknown;

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

export function mapCliTransportResultToExecutionResult(
  result: CliTransportResult,
): CliExecutionResult {
  if (!result.ok) {
    return {
      ok: false,
      reason: "TRANSPORT_ERROR",
      message: result.message,
      rawStdout: result.stdout,
      rawStderr: result.stderr,
    };
  }

  if (result.exitCode !== 0) {
    return {
      ok: false,
      reason: "EXECUTION_FAILED",
      message: `CLI execution exited with code ${result.exitCode}`,
      rawStdout: result.stdout,
      rawStderr: result.stderr,
    };
  }

  const output = parseOutput(result.stdout);

  return {
    ok: true,
    externalRunId: resolveExternalRunId(output),
    output,
    rawStdout: result.stdout,
    rawStderr: result.stderr,
  };
}
