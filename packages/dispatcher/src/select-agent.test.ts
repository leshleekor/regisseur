import { describe, expect, it } from "vitest";

import { getRequiredCapabilities, selectAgentForTask } from "./index.js";
import type { AgentDefinition, Task, TaskStatus } from "@regisseur/core";

function createAgent(
  agentId: string,
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    agentId,
    name: agentId,
    runtimeType: "cli",
    capabilities: [],
    enabled: true,
    config: {},
    ...overrides,
  };
}

function createTask(
  taskId: string,
  overrides: Partial<Task> = {},
  status: TaskStatus = "ready",
): Task {
  return {
    taskId,
    workflowId: "workflow-1",
    title: taskId,
    payload: {},
    status,
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectAgentForTask", () => {
  it("selects the explicit assignee when it exists and is enabled", () => {
    const task = createTask("task-1", {
      assigneeAgentId: "qa-agent",
      metadata: {
        requiredCapabilities: ["implementation"],
      },
    });
    const agents = [
      createAgent("dev-agent", {
        capabilities: ["implementation"],
      }),
      createAgent("qa-agent", {
        capabilities: ["review"],
      }),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "qa-agent" },
      selectionMode: "assignee",
    });
  });

  it("fails when the explicit assignee does not exist", () => {
    const task = createTask("task-1", {
      assigneeAgentId: "missing-agent",
    });

    expect(selectAgentForTask(task, [])).toMatchObject({
      ok: false,
      reason: "ASSIGNEE_NOT_FOUND",
    });
  });

  it("fails when the explicit assignee is disabled", () => {
    const task = createTask("task-1", {
      assigneeAgentId: "qa-agent",
    });
    const agents = [
      createAgent("qa-agent", {
        enabled: false,
      }),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: false,
      reason: "ASSIGNEE_DISABLED",
    });
  });

  it("selects the first enabled agent that satisfies all required capabilities", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: ["review"],
      },
    });
    const agents = [
      createAgent("dev-agent", {
        capabilities: ["implementation"],
      }),
      createAgent("qa-agent", {
        capabilities: ["review", "validation"],
      }),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "qa-agent" },
      selectionMode: "capability",
    });
  });

  it("selects the first enabled matching agent when multiple candidates satisfy capabilities", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: ["implementation"],
      },
    });
    const agents = [
      createAgent("dev-agent-1", {
        capabilities: ["implementation", "review"],
      }),
      createAgent("dev-agent-2", {
        capabilities: ["implementation", "debugging"],
      }),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "dev-agent-1" },
      selectionMode: "capability",
    });
  });

  it("fails when an agent only satisfies part of the required capabilities", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: ["implementation", "debugging"],
      },
    });
    const agents = [
      createAgent("dev-agent", {
        capabilities: ["implementation"],
      }),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: false,
      reason: "NO_MATCHING_AGENT",
    });
  });

  it("excludes disabled agents even if they satisfy required capabilities", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: ["review"],
      },
    });
    const agents = [
      createAgent("qa-agent", {
        capabilities: ["review"],
        enabled: false,
      }),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: false,
      reason: "NO_MATCHING_AGENT",
    });
  });

  it("falls back to the first enabled agent when there is no assignee or capability requirement", () => {
    const task = createTask("task-1");
    const agents = [
      createAgent("agent-1"),
      createAgent("agent-2"),
      createAgent("agent-3"),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "agent-1" },
      selectionMode: "fallback",
    });
  });

  it("skips disabled agents during fallback selection", () => {
    const task = createTask("task-1");
    const agents = [
      createAgent("agent-1", {
        enabled: false,
      }),
      createAgent("agent-2"),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "agent-2" },
      selectionMode: "fallback",
    });
  });

  it("fails when no enabled agent is available for fallback selection", () => {
    const task = createTask("task-1");
    const agents = [
      createAgent("agent-1", {
        enabled: false,
      }),
      createAgent("agent-2", {
        enabled: false,
      }),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: false,
      reason: "NO_MATCHING_AGENT",
    });
  });

  it("treats missing requiredCapabilities metadata as an empty capability requirement", () => {
    const task = createTask("task-1", {
      metadata: undefined,
    });
    const agents = [createAgent("agent-1"), createAgent("agent-2")];

    expect(getRequiredCapabilities(task)).toEqual([]);
    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "agent-1" },
      selectionMode: "fallback",
    });
  });

  it.each(["review", { capability: "review" }, null])(
    "treats non-array requiredCapabilities values as empty requirements: %p",
    (value) => {
      const task = createTask("task-1", {
        metadata: {
          requiredCapabilities: value,
        },
      });
      const agents = [createAgent("agent-1"), createAgent("agent-2")];

      expect(getRequiredCapabilities(task)).toEqual([]);
      expect(selectAgentForTask(task, agents)).toMatchObject({
        ok: true,
        agent: { agentId: "agent-1" },
        selectionMode: "fallback",
      });
    },
  );

  it("treats an empty requiredCapabilities array as a fallback case", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: [],
      },
    });
    const agents = [createAgent("agent-1"), createAgent("agent-2")];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "agent-1" },
      selectionMode: "fallback",
    });
  });

  it("treats non-string capability arrays as invalid and falls back", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: [1, 2, 3],
      },
    });
    const agents = [createAgent("agent-1"), createAgent("agent-2")];

    expect(getRequiredCapabilities(task)).toEqual([]);
    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "agent-1" },
      selectionMode: "fallback",
    });
  });

  it("treats mixed-type capability arrays as invalid and falls back", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: ["review", 1],
      },
    });
    const agents = [createAgent("agent-1"), createAgent("agent-2")];

    expect(getRequiredCapabilities(task)).toEqual([]);
    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "agent-1" },
      selectionMode: "fallback",
    });
  });

  it("treats null values inside the capability array as invalid and falls back", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: [null],
      },
    });
    const agents = [createAgent("agent-1"), createAgent("agent-2")];

    expect(getRequiredCapabilities(task)).toEqual([]);
    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "agent-1" },
      selectionMode: "fallback",
    });
  });

  it("fails when the agent pool is empty", () => {
    const task = createTask("task-1");

    expect(selectAgentForTask(task, [])).toMatchObject({
      ok: false,
      reason: "NO_MATCHING_AGENT",
    });
  });

  it("matches all required capabilities when the list is long", () => {
    const task = createTask("task-1", {
      metadata: {
        requiredCapabilities: [
          "analysis",
          "review",
          "implementation",
          "debugging",
          "validation",
        ],
      },
    });
    const agents = [
      createAgent("partial-agent", {
        capabilities: ["analysis", "review", "implementation"],
      }),
      createAgent("full-agent", {
        capabilities: [
          "analysis",
          "review",
          "implementation",
          "debugging",
          "validation",
        ],
      }),
    ];

    expect(selectAgentForTask(task, agents)).toMatchObject({
      ok: true,
      agent: { agentId: "full-agent" },
      selectionMode: "capability",
    });
  });
});
