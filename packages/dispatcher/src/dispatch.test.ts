import { describe, expect, it, vi } from "vitest";

import {
  createDispatchRequest,
  dispatchReadyTasks,
  dispatchTask,
} from "./index.js";
import type {
  DispatchEnqueuePort,
  DispatchEnqueuePortResult,
  DispatchRequest,
} from "./index.js";
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
  status: TaskStatus = "ready",
  overrides: Partial<Task> = {},
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

function createEnqueuePort(
  implementation?: (
    request: DispatchRequest,
  ) => Promise<DispatchEnqueuePortResult>,
): DispatchEnqueuePort {
  return {
    enqueueTaskDispatch: vi.fn(
      implementation ??
        (async () => ({
          ok: true,
          jobId: "job-1",
        })),
    ),
  };
}

describe("createDispatchRequest", () => {
  it("creates a dispatch request with the minimum required fields", () => {
    const request = createDispatchRequest(
      createTask("task-1"),
      createAgent("agent-1"),
      {
        requestedAt: "2026-03-15T01:00:00.000Z",
      },
    );

    expect(request).toEqual({
      taskId: "task-1",
      workflowId: "workflow-1",
      agentId: "agent-1",
      triggerSource: "internal",
      requestedAt: "2026-03-15T01:00:00.000Z",
    });
  });

  it("respects an explicit triggerSource option", () => {
    const request = createDispatchRequest(
      createTask("task-1"),
      createAgent("agent-1"),
      {
        triggerSource: "manual",
        requestedAt: "2026-03-15T01:00:00.000Z",
      },
    );

    expect(request.triggerSource).toBe("manual");
  });

  it("defaults triggerSource to internal", () => {
    const request = createDispatchRequest(
      createTask("task-1"),
      createAgent("agent-1"),
      {
        requestedAt: "2026-03-15T01:00:00.000Z",
      },
    );

    expect(request.triggerSource).toBe("internal");
  });

  it("creates a non-empty ISO requestedAt string when no override is provided", () => {
    const request = createDispatchRequest(
      createTask("task-1"),
      createAgent("agent-1"),
    );

    expect(typeof request.requestedAt).toBe("string");
    expect(request.requestedAt).not.toHaveLength(0);
    expect(request.requestedAt).toContain("T");
  });

  it("uses the requestedAt override unchanged when supplied", () => {
    const request = createDispatchRequest(
      createTask("task-1"),
      createAgent("agent-1"),
      {
        requestedAt: "2026-03-15T01:23:45.000Z",
      },
    );

    expect(request.requestedAt).toBe("2026-03-15T01:23:45.000Z");
  });
});

describe("dispatchTask", () => {
  it("dispatches a ready task successfully", async () => {
    const task = createTask("task-1");
    const agents = [
      createAgent("agent-1", {
        capabilities: ["implementation"],
      }),
    ];
    const enqueuePort = createEnqueuePort();

    const result = await dispatchTask(task, agents, enqueuePort, {
      triggerSource: "manual",
      requestedAt: "2026-03-15T01:00:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      taskId: "task-1",
      workflowId: "workflow-1",
      agentId: "agent-1",
      enqueueResult: {
        ok: true,
        jobId: "job-1",
      },
    });
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledWith({
      taskId: "task-1",
      workflowId: "workflow-1",
      agentId: "agent-1",
      triggerSource: "manual",
      requestedAt: "2026-03-15T01:00:00.000Z",
    });
  });

  it("dispatches an assignee-based ready task with the assignee agent id in the payload", async () => {
    const task = createTask("task-1", "ready", {
      assigneeAgentId: "qa-agent",
    });
    const agents = [
      createAgent("qa-agent", {
        capabilities: ["review"],
      }),
    ];
    const enqueuePort = createEnqueuePort();

    await dispatchTask(task, agents, enqueuePort, {
      requestedAt: "2026-03-15T01:00:00.000Z",
    });

    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledWith({
      taskId: "task-1",
      workflowId: "workflow-1",
      agentId: "qa-agent",
      triggerSource: "internal",
      requestedAt: "2026-03-15T01:00:00.000Z",
    });
  });

  it("propagates the enqueue success jobId into the successful dispatch result", async () => {
    const task = createTask("task-1");
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort(async () => ({
      ok: true,
      jobId: "job-123",
    }));

    const result = await dispatchTask(task, agents, enqueuePort);

    expect(result).toMatchObject({
      ok: true,
      agentId: "agent-1",
      enqueueResult: {
        ok: true,
        jobId: "job-123",
      },
    });
  });

  it.each([
    "pending",
    "blocked",
    "waiting",
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ] as const)(
    "returns TASK_NOT_READY for %s tasks and does not call the enqueue port",
    async (status) => {
      const task = createTask("task-1", status);
      const agents = [createAgent("agent-1")];
      const enqueuePort = createEnqueuePort();

      const result = await dispatchTask(task, agents, enqueuePort);

      expect(result).toMatchObject({
        ok: false,
        taskId: "task-1",
        workflowId: "workflow-1",
        reason: "TASK_NOT_READY",
      });
      expect(enqueuePort.enqueueTaskDispatch).not.toHaveBeenCalled();
    },
  );

  it("fails when no matching agent exists and does not call the enqueue port", async () => {
    const task = createTask("task-1", "ready", {
      metadata: {
        requiredCapabilities: ["review"],
      },
    });
    const agents = [
      createAgent("agent-1", {
        capabilities: ["implementation"],
      }),
    ];
    const enqueuePort = createEnqueuePort();

    const result = await dispatchTask(task, agents, enqueuePort);

    expect(result).toMatchObject({
      ok: false,
      reason: "NO_MATCHING_AGENT",
    });
    expect(enqueuePort.enqueueTaskDispatch).not.toHaveBeenCalled();
  });

  it("fails when the assignee cannot be found and does not call the enqueue port", async () => {
    const task = createTask("task-1", "ready", {
      assigneeAgentId: "missing-agent",
    });
    const enqueuePort = createEnqueuePort();

    const result = await dispatchTask(task, [], enqueuePort);

    expect(result).toMatchObject({
      ok: false,
      reason: "ASSIGNEE_NOT_FOUND",
    });
    expect(enqueuePort.enqueueTaskDispatch).not.toHaveBeenCalled();
  });

  it("fails when the assignee is disabled and does not call the enqueue port", async () => {
    const task = createTask("task-1", "ready", {
      assigneeAgentId: "qa-agent",
    });
    const agents = [
      createAgent("qa-agent", {
        enabled: false,
      }),
    ];
    const enqueuePort = createEnqueuePort();

    const result = await dispatchTask(task, agents, enqueuePort);

    expect(result).toMatchObject({
      ok: false,
      reason: "ASSIGNEE_DISABLED",
    });
    expect(enqueuePort.enqueueTaskDispatch).not.toHaveBeenCalled();
  });

  it("returns ENQUEUE_FAILED when the enqueue port throws", async () => {
    const task = createTask("task-1");
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort(async () => {
      throw new Error("queue unavailable");
    });

    const result = await dispatchTask(task, agents, enqueuePort);

    expect(result).toEqual({
      ok: false,
      taskId: "task-1",
      workflowId: "workflow-1",
      reason: "ENQUEUE_FAILED",
      message: "queue unavailable",
    });
  });

  it("maps enqueue port failure responses into ENQUEUE_FAILED results", async () => {
    const task = createTask("task-1");
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort(async () => ({
      ok: false,
      message: "queue unavailable",
    }));

    const result = await dispatchTask(task, agents, enqueuePort);

    expect(result).toEqual({
      ok: false,
      taskId: "task-1",
      workflowId: "workflow-1",
      reason: "ENQUEUE_FAILED",
      message: "queue unavailable",
    });
  });

  it("does not rethrow raw enqueue errors", async () => {
    const task = createTask("task-1");
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort(async () => {
      throw new Error("boom");
    });

    await expect(
      dispatchTask(task, agents, enqueuePort),
    ).resolves.toMatchObject({
      ok: false,
      reason: "ENQUEUE_FAILED",
    });
  });

  it("keeps task context in enqueue failure results", async () => {
    const task = createTask("task-42", "ready", {
      workflowId: "workflow-42",
    });
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort(async () => ({
      ok: false,
      message: "queue unavailable",
    }));

    const result = await dispatchTask(task, agents, enqueuePort);

    expect(result).toEqual({
      ok: false,
      taskId: "task-42",
      workflowId: "workflow-42",
      reason: "ENQUEUE_FAILED",
      message: "queue unavailable",
    });
  });

  it("sends payloads that match the selected task and agent combination", async () => {
    const task = createTask("task-1", "ready", {
      workflowId: "workflow-99",
      metadata: {
        requiredCapabilities: ["review"],
      },
    });
    const agents = [
      createAgent("qa-agent", {
        capabilities: ["review"],
      }),
    ];
    const enqueuePort = createEnqueuePort();

    await dispatchTask(task, agents, enqueuePort, {
      triggerSource: "schedule",
      requestedAt: "2026-03-15T03:00:00.000Z",
    });

    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledWith({
      taskId: "task-1",
      workflowId: "workflow-99",
      agentId: "qa-agent",
      triggerSource: "schedule",
      requestedAt: "2026-03-15T03:00:00.000Z",
    });
  });

  it("handles undefined metadata without crashing", async () => {
    const task = createTask("task-1", "ready", {
      metadata: undefined,
    });
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort();

    const result = await dispatchTask(task, agents, enqueuePort);

    expect(result).toMatchObject({
      ok: true,
      agentId: "agent-1",
    });
  });

  it("treats malformed metadata capability shapes defensively without crashing", async () => {
    const task = createTask("task-1", "ready", {
      metadata: {
        requiredCapabilities: {
          capability: "review",
        },
      },
    });
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort();

    const result = await dispatchTask(task, agents, enqueuePort);

    expect(result).toMatchObject({
      ok: true,
      agentId: "agent-1",
    });
  });
});

describe("dispatchReadyTasks", () => {
  it("returns one result per task while iterating tasks in input order", async () => {
    const tasks = [
      createTask("task-1"),
      createTask("task-2", "blocked"),
      createTask("task-3"),
    ];
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort();

    const results = await dispatchReadyTasks(tasks, agents, enqueuePort);

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.taskId)).toEqual([
      "task-1",
      "task-2",
      "task-3",
    ]);
    expect(results[0]).toMatchObject({ ok: true, taskId: "task-1" });
    expect(results[1]).toMatchObject({
      ok: false,
      taskId: "task-2",
      reason: "TASK_NOT_READY",
    });
    expect(results[2]).toMatchObject({ ok: true, taskId: "task-3" });
  });

  it("calls the enqueue port only for ready tasks", async () => {
    const tasks = [
      createTask("task-1"),
      createTask("task-2", "pending"),
      createTask("task-3", "waiting"),
      createTask("task-4"),
    ];
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort();

    await dispatchReadyTasks(tasks, agents, enqueuePort);

    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledTimes(2);
  });

  it("continues dispatching later tasks even if an earlier enqueue fails", async () => {
    const tasks = [createTask("task-1"), createTask("task-2")];
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort(async (request) => {
      if (request.taskId === "task-1") {
        return {
          ok: false,
          message: "queue unavailable",
        };
      }

      return {
        ok: true,
        jobId: "job-2",
      };
    });

    const results = await dispatchReadyTasks(tasks, agents, enqueuePort);

    expect(results).toEqual([
      {
        ok: false,
        taskId: "task-1",
        workflowId: "workflow-1",
        reason: "ENQUEUE_FAILED",
        message: "queue unavailable",
      },
      {
        ok: true,
        taskId: "task-2",
        workflowId: "workflow-1",
        agentId: "agent-1",
        enqueueResult: {
          ok: true,
          jobId: "job-2",
        },
      },
    ]);
  });

  it("reuses the same agents pool and enqueue port for every task", async () => {
    const tasks = [createTask("task-1"), createTask("task-2")];
    const agents = [createAgent("agent-1"), createAgent("agent-2")];
    const enqueuePort = createEnqueuePort();

    await dispatchReadyTasks(tasks, agents, enqueuePort);

    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledTimes(2);
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        taskId: "task-1",
        agentId: "agent-1",
      }),
    );
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        taskId: "task-2",
        agentId: "agent-1",
      }),
    );
  });

  it("applies a shared triggerSource option to every dispatched task", async () => {
    const tasks = [createTask("task-1"), createTask("task-2")];
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort();

    await dispatchReadyTasks(tasks, agents, enqueuePort, {
      triggerSource: "schedule",
    });

    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        triggerSource: "schedule",
      }),
    );
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        triggerSource: "schedule",
      }),
    );
  });

  it("applies a shared requestedAt option to every dispatched task", async () => {
    const tasks = [createTask("task-1"), createTask("task-2")];
    const agents = [createAgent("agent-1")];
    const enqueuePort = createEnqueuePort();

    await dispatchReadyTasks(tasks, agents, enqueuePort, {
      requestedAt: "2026-03-15T05:00:00.000Z",
    });

    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        requestedAt: "2026-03-15T05:00:00.000Z",
      }),
    );
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requestedAt: "2026-03-15T05:00:00.000Z",
      }),
    );
  });

  it("creates distinct payloads per task and reflects assignee and automatic selection agent ids", async () => {
    const tasks = [
      createTask("task-1", "ready", {
        assigneeAgentId: "qa-agent",
      }),
      createTask("task-2", "ready", {
        metadata: {
          requiredCapabilities: ["implementation"],
        },
      }),
    ];
    const agents = [
      createAgent("qa-agent", {
        capabilities: ["review"],
      }),
      createAgent("dev-agent", {
        capabilities: ["implementation"],
      }),
    ];
    const enqueuePort = createEnqueuePort();

    await dispatchReadyTasks(tasks, agents, enqueuePort, {
      triggerSource: "manual",
      requestedAt: "2026-03-15T06:00:00.000Z",
    });

    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenNthCalledWith(1, {
      taskId: "task-1",
      workflowId: "workflow-1",
      agentId: "qa-agent",
      triggerSource: "manual",
      requestedAt: "2026-03-15T06:00:00.000Z",
    });
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenNthCalledWith(2, {
      taskId: "task-2",
      workflowId: "workflow-1",
      agentId: "dev-agent",
      triggerSource: "manual",
      requestedAt: "2026-03-15T06:00:00.000Z",
    });
  });
});
