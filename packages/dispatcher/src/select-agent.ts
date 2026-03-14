import type { AgentDefinition, Task } from "@regisseur/core";

import type {
  AgentSelectionFailureReason,
  AgentSelectionMode,
  SelectAgentResult,
} from "./types.js";

function createSelectionFailure(
  reason: AgentSelectionFailureReason,
  message: string,
  requiredCapabilities: string[],
): SelectAgentResult {
  return {
    ok: false,
    reason,
    message,
    requiredCapabilities,
  };
}

function createSelectionSuccess(
  agent: AgentDefinition,
  requiredCapabilities: string[],
  selectionMode: AgentSelectionMode,
): SelectAgentResult {
  return {
    ok: true,
    agent,
    requiredCapabilities,
    selectionMode,
  };
}

/**
 * Reads requiredCapabilities defensively from task metadata.
 *
 * Only string[] is accepted. Any other shape falls back to an empty list.
 */
export function getRequiredCapabilities(task: Task): string[] {
  const rawRequiredCapabilities = task.metadata?.requiredCapabilities;

  if (
    !Array.isArray(rawRequiredCapabilities) ||
    !rawRequiredCapabilities.every((value) => typeof value === "string")
  ) {
    return [];
  }

  return [...rawRequiredCapabilities];
}

/**
 * Selects an agent for a task using the dispatcher MVP rules:
 *
 * 1. Explicit assignee wins.
 * 2. Otherwise all required capabilities must match.
 * 3. Otherwise the first enabled agent is used as a fallback.
 */
export function selectAgentForTask(
  task: Task,
  agents: readonly AgentDefinition[],
): SelectAgentResult {
  const requiredCapabilities = getRequiredCapabilities(task);

  if (task.assigneeAgentId) {
    const assignee = agents.find(
      (agent) => agent.agentId === task.assigneeAgentId,
    );

    if (!assignee) {
      return createSelectionFailure(
        "ASSIGNEE_NOT_FOUND",
        `Task ${task.taskId} references missing assignee ${task.assigneeAgentId}`,
        requiredCapabilities,
      );
    }

    if (!assignee.enabled) {
      return createSelectionFailure(
        "ASSIGNEE_DISABLED",
        `Task ${task.taskId} assignee ${task.assigneeAgentId} is disabled`,
        requiredCapabilities,
      );
    }

    return createSelectionSuccess(assignee, requiredCapabilities, "assignee");
  }

  const enabledAgents = agents.filter((agent) => agent.enabled);

  if (requiredCapabilities.length > 0) {
    const matchingAgent = enabledAgents.find((agent) =>
      requiredCapabilities.every((capability) =>
        agent.capabilities.includes(capability),
      ),
    );

    if (!matchingAgent) {
      return createSelectionFailure(
        "NO_MATCHING_AGENT",
        `Task ${task.taskId} has no enabled agent matching capabilities: ${requiredCapabilities.join(", ")}`,
        requiredCapabilities,
      );
    }

    return createSelectionSuccess(
      matchingAgent,
      requiredCapabilities,
      "capability",
    );
  }

  const fallbackAgent = enabledAgents[0];

  if (!fallbackAgent) {
    return createSelectionFailure(
      "NO_MATCHING_AGENT",
      `Task ${task.taskId} has no enabled agents available for fallback selection`,
      requiredCapabilities,
    );
  }

  return createSelectionSuccess(
    fallbackAgent,
    requiredCapabilities,
    "fallback",
  );
}
