import type { Task } from "@regisseur/core";

export const OPENCLAW_MODES = ["command"] as const;

export type OpenClawMode = (typeof OPENCLAW_MODES)[number];

export interface OpenClawConfig {
  command: string;
  args: string[];
  workingDirectory?: string;
  env?: Record<string, string>;
  agentName?: string;
  mode: OpenClawMode;
}

export interface OpenClawExecutionInput {
  taskId: string;
  workflowId: string;
  title: string;
  payload: Task["payload"];
  agentId: string;
  agentName?: string;
}

export interface OpenClawExecutionRequest {
  command: string;
  args: string[];
  workingDirectory?: string;
  env?: Record<string, string>;
  input: OpenClawExecutionInput;
}

export interface OpenClawTransportSuccessResult {
  ok: true;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface OpenClawTransportFailureResult {
  ok: false;
  message: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export type OpenClawTransportResult =
  | OpenClawTransportSuccessResult
  | OpenClawTransportFailureResult;

export const OPENCLAW_EXECUTION_FAILURE_REASONS = [
  "INVALID_AGENT_RUNTIME",
  "INVALID_AGENT_CONFIG",
  "TRANSPORT_ERROR",
  "EXECUTION_FAILED",
] as const;

export type OpenClawExecutionFailureReason =
  (typeof OPENCLAW_EXECUTION_FAILURE_REASONS)[number];

export type OpenClawExecutionResult =
  | {
      ok: true;
      externalRunId?: string;
      output?: Record<string, unknown>;
      rawStdout?: string;
      rawStderr?: string;
    }
  | {
      ok: false;
      reason: OpenClawExecutionFailureReason;
      message: string;
      rawStdout?: string;
      rawStderr?: string;
    };
