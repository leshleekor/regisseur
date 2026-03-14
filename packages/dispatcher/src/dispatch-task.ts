import type { AgentDefinition, Task } from "@regisseur/core";

import { createDispatchRequest } from "./dispatch-request.js";
import type { DispatchEnqueuePort } from "./ports.js";
import { selectAgentForTask } from "./select-agent.js";
import type {
  DispatchRequestOptions,
  DispatchTaskResult,
  SelectAgentResult,
} from "./types.js";

/**
 * Dispatcher only treats ready tasks as dispatchable.
 */
export function isDispatchableTask(task: Task): boolean {
  return task.status === "ready";
}

function createTaskFailureResult(
  task: Task,
  reason: Extract<DispatchTaskResult, { ok: false }>["reason"],
  message: string,
): DispatchTaskResult {
  return {
    ok: false,
    taskId: task.taskId,
    workflowId: task.workflowId,
    reason,
    message,
  };
}

function mapAgentSelectionFailure(
  task: Task,
  result: Extract<SelectAgentResult, { ok: false }>,
): DispatchTaskResult {
  return createTaskFailureResult(task, result.reason, result.message);
}

/**
 * Dispatches a single task by selecting an agent, building a dispatch request,
 * and forwarding it to the injected enqueue port.
 */
export async function dispatchTask(
  task: Task,
  agents: readonly AgentDefinition[],
  enqueuePort: DispatchEnqueuePort,
  options: DispatchRequestOptions = {},
): Promise<DispatchTaskResult> {
  if (!isDispatchableTask(task)) {
    return createTaskFailureResult(
      task,
      "TASK_NOT_READY",
      `Task ${task.taskId} is not dispatchable because status is ${task.status}`,
    );
  }

  const selectedAgent = selectAgentForTask(task, agents);

  if (!selectedAgent.ok) {
    return mapAgentSelectionFailure(task, selectedAgent);
  }

  const request = createDispatchRequest(task, selectedAgent.agent, options);

  try {
    const enqueueResult = await enqueuePort.enqueueTaskDispatch(request);

    if (!enqueueResult.ok) {
      return createTaskFailureResult(
        task,
        "ENQUEUE_FAILED",
        enqueueResult.message,
      );
    }

    return {
      ok: true,
      taskId: task.taskId,
      workflowId: task.workflowId,
      agentId: selectedAgent.agent.agentId,
      enqueueResult,
    };
  } catch (error) {
    return createTaskFailureResult(
      task,
      "ENQUEUE_FAILED",
      error instanceof Error
        ? error.message
        : `Unknown enqueue failure for task ${task.taskId}`,
    );
  }
}
