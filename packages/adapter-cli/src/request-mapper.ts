import type { AgentDefinition, Task } from "@regisseur/core";

import type { CliConfig, CliExecutionRequest } from "./types.js";

export function createCliExecutionRequest(
  task: Task,
  agent: AgentDefinition,
  config: CliConfig,
): CliExecutionRequest {
  return {
    command: config.command,
    args: [...config.args],
    workingDirectory: config.workingDirectory,
    env: config.env ? { ...config.env } : undefined,
    stdinInput: {
      taskId: task.taskId,
      workflowId: task.workflowId,
      title: task.title,
      payload: task.payload,
      agentId: agent.agentId,
      ...(config.agentName ? { agentName: config.agentName } : {}),
    },
  };
}
