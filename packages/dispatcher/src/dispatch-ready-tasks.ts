import type { AgentDefinition, Task } from "@regisseur/core";

import type { DispatchEnqueuePort } from "./ports.js";
import { dispatchTask } from "./dispatch-task.js";
import type { DispatchRequestOptions, DispatchTaskResult } from "./types.js";

/**
 * Dispatches tasks sequentially in input order and always returns one result
 * per input task.
 */
export async function dispatchReadyTasks(
  tasks: readonly Task[],
  agents: readonly AgentDefinition[],
  enqueuePort: DispatchEnqueuePort,
  options: DispatchRequestOptions = {},
): Promise<DispatchTaskResult[]> {
  const results: DispatchTaskResult[] = [];

  for (const task of tasks) {
    results.push(await dispatchTask(task, agents, enqueuePort, options));
  }

  return results;
}
