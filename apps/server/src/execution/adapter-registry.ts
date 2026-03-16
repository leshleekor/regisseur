import type { AgentRuntimeType } from "@regisseur/core";
import type { CliExecutionResult } from "@regisseur/adapter-cli";
import type { HttpExecutionResult } from "@regisseur/adapter-http";
import type { OpenClawExecutionResult } from "@regisseur/adapter-openclaw";

import type {
  ExecutableAdapterRegistry,
  ExecutionAdapter,
  ExecutionResult,
} from "../types.js";

type RawExecutionResult =
  | HttpExecutionResult
  | CliExecutionResult
  | OpenClawExecutionResult;

export function normalizeExecutionResult(
  result: RawExecutionResult,
): ExecutionResult {
  if (result.ok) {
    return {
      ok: true,
      externalRunId: result.externalRunId,
      output: result.output,
    };
  }

  return {
    ok: false,
    message: result.message,
    reason: result.reason,
  };
}

export function getExecutionAdapter(
  registry: ExecutableAdapterRegistry,
  runtimeType: AgentRuntimeType,
): ExecutionAdapter | undefined {
  switch (runtimeType) {
    case "http":
      return registry.http;
    case "cli":
      return registry.cli;
    case "openclaw":
      return registry.openclaw;
  }
}
