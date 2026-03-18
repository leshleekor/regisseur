import type { AgentDefinition, Task } from "@regisseur/core";

import type { OpenClawConfig, OpenClawExecutionRequest } from "./types.js";

export function createOpenClawExecutionRequest(
  task: Task,
  agent: AgentDefinition,
  config: OpenClawConfig,
): OpenClawExecutionRequest {
  return {
    command: config.command,
    args: [...config.args],
    workingDirectory: config.workingDirectory,
    env: config.env ? { ...config.env } : undefined,
    input: {
      taskId: task.taskId,
      workflowId: task.workflowId,
      title: task.title,
      payload: task.payload,
      agentId: agent.agentId,
      agentName: config.agentName,
    },
  };
}
