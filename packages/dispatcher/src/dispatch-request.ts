import type { AgentDefinition, Task } from "@regisseur/core";

import type { DispatchRequest, DispatchRequestOptions } from "./types.js";

/**
 * Creates the dispatcher-local enqueue contract after agent selection.
 */
export function createDispatchRequest(
  task: Task,
  agent: AgentDefinition,
  options: DispatchRequestOptions = {},
): DispatchRequest {
  return {
    taskId: task.taskId,
    workflowId: task.workflowId,
    agentId: agent.agentId,
    triggerSource: options.triggerSource ?? "internal",
    requestedAt: options.requestedAt ?? new Date().toISOString(),
  };
}
