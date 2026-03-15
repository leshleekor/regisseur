import type { AgentDefinition, Task } from "@regisseur/core";

import type { HttpConfig, HttpExecutionRequest } from "./types.js";

export function createHttpExecutionRequest(
  task: Task,
  agent: AgentDefinition,
  config: HttpConfig,
): HttpExecutionRequest {
  const headers = { ...config.headers };

  if (config.authToken !== undefined) {
    headers.Authorization = `Bearer ${config.authToken}`;
  }

  return {
    url: config.url,
    method: config.method,
    headers,
    timeoutMs: config.timeoutMs,
    body: {
      taskId: task.taskId,
      workflowId: task.workflowId,
      title: task.title,
      payload: task.payload,
      agentId: agent.agentId,
      // HTTP keeps agent.name as the opt-in outward identifier per WORK-09.
      ...(config.includeAgentName ? { agentName: agent.name } : {}),
    },
  };
}
