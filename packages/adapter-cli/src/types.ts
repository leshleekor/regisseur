import type { Task } from "@regisseur/core";

export const CLI_INPUT_MODES = ["stdin"] as const;

export type CliInputMode = (typeof CLI_INPUT_MODES)[number];

export interface CliConfig {
  command: string;
  args: string[];
  workingDirectory?: string;
  env?: Record<string, string>;
  inputMode: CliInputMode;
  agentName?: string;
}

export interface CliStdinInput {
  taskId: string;
  workflowId: string;
  title: string;
  payload: Task["payload"];
  agentId: string;
  agentName?: string;
}

export interface CliExecutionRequest {
  command: string;
  args: string[];
  workingDirectory?: string;
  env?: Record<string, string>;
  stdinInput: CliStdinInput;
}

export interface CliTransportSuccessResult {
  ok: true;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CliTransportFailureResult {
  ok: false;
  message: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export type CliTransportResult =
  | CliTransportSuccessResult
  | CliTransportFailureResult;

export const CLI_EXECUTION_FAILURE_REASONS = [
  "INVALID_AGENT_RUNTIME",
  "INVALID_AGENT_CONFIG",
  "TRANSPORT_ERROR",
  "EXECUTION_FAILED",
] as const;

export type CliExecutionFailureReason =
  (typeof CLI_EXECUTION_FAILURE_REASONS)[number];

export type CliExecutionResult =
  | {
      ok: true;
      externalRunId?: string;
      output?: Record<string, unknown>;
      rawStdout?: string;
      rawStderr?: string;
    }
  | {
      ok: false;
      reason: CliExecutionFailureReason;
      message: string;
      rawStdout?: string;
      rawStderr?: string;
    };
