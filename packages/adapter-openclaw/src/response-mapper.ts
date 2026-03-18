import type {
  OpenClawExecutionResult,
  OpenClawTransportResult,
} from "./types.js";

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

export function mapTransportResultToExecutionResult(
  result: OpenClawTransportResult,
): OpenClawExecutionResult {
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
      message: `OpenClaw execution exited with code ${result.exitCode}`,
      rawStdout: result.stdout,
      rawStderr: result.stderr,
    };
  }

  return {
    ok: true,
    output: parseOutput(result.stdout),
    rawStdout: result.stdout,
    rawStderr: result.stderr,
  };
}
