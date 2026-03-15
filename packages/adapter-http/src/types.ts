import type { Task } from "@regisseur/core";

export const HTTP_ADAPTER_METHODS = ["POST"] as const;

export type HttpAdapterMethod = (typeof HTTP_ADAPTER_METHODS)[number];

export interface HttpConfig {
  url: string;
  method: HttpAdapterMethod;
  // The parser normalizes missing headers to an empty object.
  headers: Record<string, string>;
  timeoutMs?: number;
  authToken?: string;
  includeAgentName: boolean;
}

export interface HttpExecutionBody {
  taskId: string;
  workflowId: string;
  title: string;
  payload: Task["payload"];
  agentId: string;
  agentName?: string;
}

export interface HttpExecutionRequest {
  url: string;
  method: HttpAdapterMethod;
  headers: Record<string, string>;
  timeoutMs?: number;
  body: HttpExecutionBody;
}

export interface HttpTransportSuccessResult {
  ok: true;
  status: number;
  bodyText: string;
  headers?: Record<string, string>;
}

export interface HttpTransportFailureResult {
  ok: false;
  message: string;
  status?: number;
  bodyText?: string;
}

export type HttpTransportResult =
  | HttpTransportSuccessResult
  | HttpTransportFailureResult;

export const HTTP_EXECUTION_FAILURE_REASONS = [
  "INVALID_AGENT_RUNTIME",
  "INVALID_AGENT_CONFIG",
  "TRANSPORT_ERROR",
  "EXECUTION_FAILED",
] as const;

export type HttpExecutionFailureReason =
  (typeof HTTP_EXECUTION_FAILURE_REASONS)[number];

export type HttpExecutionResult =
  | {
      ok: true;
      externalRunId?: string;
      output?: Record<string, unknown>;
      rawBodyText?: string;
    }
  | {
      ok: false;
      reason: HttpExecutionFailureReason;
      message: string;
      rawBodyText?: string;
    };
