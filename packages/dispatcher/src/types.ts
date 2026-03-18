import type { AgentDefinition, DispatchTriggerSource } from "@regisseur/core";

export { DISPATCH_TRIGGER_SOURCES } from "@regisseur/core";
export type { DispatchTriggerSource } from "@regisseur/core";

/**
 * Dispatcher-local contract describing what should be enqueued after agent
 * selection is complete.
 */
export interface DispatchRequest {
  taskId: string;
  workflowId: string;
  agentId: string;
  triggerSource: DispatchTriggerSource;
  requestedAt: string;
}

/**
 * Optional overrides when building dispatch requests.
 */
export interface DispatchRequestOptions {
  triggerSource?: DispatchTriggerSource;
  requestedAt?: string;
}

export const DISPATCH_FAILURE_REASONS = [
  "TASK_NOT_READY",
  "ASSIGNEE_NOT_FOUND",
  "ASSIGNEE_DISABLED",
  "NO_MATCHING_AGENT",
  "ENQUEUE_FAILED",
] as const;

/**
 * Structured failure reasons returned by dispatcher entrypoints.
 */
export type DispatchFailureReason = (typeof DISPATCH_FAILURE_REASONS)[number];

/**
 * Failure reasons produced during agent selection.
 */
export type AgentSelectionFailureReason = Extract<
  DispatchFailureReason,
  "ASSIGNEE_NOT_FOUND" | "ASSIGNEE_DISABLED" | "NO_MATCHING_AGENT"
>;

/**
 * Successful enqueue result. This is intentionally fixed and narrow so tests
 * can compare it exactly.
 */
export interface DispatchEnqueueSuccessResult {
  ok: true;
  jobId?: string;
}

/**
 * Failed enqueue result returned by the injected port.
 */
export interface DispatchEnqueueFailureResult {
  ok: false;
  message: string;
}

/**
 * Dispatcher enqueue port result union.
 */
export type DispatchEnqueuePortResult =
  | DispatchEnqueueSuccessResult
  | DispatchEnqueueFailureResult;

/**
 * Strategy used to select an agent for a task.
 */
export type AgentSelectionMode = "assignee" | "capability" | "fallback";

/**
 * Result returned by agent selection.
 */
export type SelectAgentResult =
  | {
      ok: true;
      agent: AgentDefinition;
      requiredCapabilities: string[];
      selectionMode: AgentSelectionMode;
    }
  | {
      ok: false;
      reason: AgentSelectionFailureReason;
      message: string;
      requiredCapabilities: string[];
    };

/**
 * Structured result returned when dispatching a single task.
 */
export type DispatchTaskResult =
  | {
      ok: true;
      taskId: string;
      workflowId: string;
      agentId: string;
      enqueueResult: DispatchEnqueueSuccessResult;
    }
  | {
      ok: false;
      taskId: string;
      workflowId: string;
      reason: DispatchFailureReason;
      message: string;
    };
