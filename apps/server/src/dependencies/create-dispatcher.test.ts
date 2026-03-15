import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentDefinition, Task, TaskEdge } from "@regisseur/core";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import { buildApp } from "../app.js";
import { createServerDependencies } from "../plugins/repositories.js";
import type { ServerRepositories } from "../types.js";
import { createDispatcher } from "./create-dispatcher.js";

function createAgent(): AgentDefinition {
  return {
    agentId: "agent-1",
    name: "Agent One",
    runtimeType: "cli",
    capabilities: [],
    enabled: true,
    config: {},
  };
}

function createTask(): Task {
  return {
    taskId: "task-1",
    workflowId: "workflow-1",
    title: "Task One",
    payload: {},
    status: "ready",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
  };
}

function createRepositories(
  task: Task,
  agent: AgentDefinition,
): ServerRepositories {
  const taskEdges: TaskEdge[] = [];

  return {
    agentsRepository: {
      upsert: vi.fn(),
      findAll: vi.fn(async () => [agent]),
      findEnabled: vi.fn(async () => [agent]),
      findById: vi.fn(async () => agent),
      deleteById: vi.fn(),
    },
    workflowsRepository: {
      upsert: vi.fn(),
      findAll: vi.fn(async () => []),
      findByStatus: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      deleteById: vi.fn(),
    },
    tasksRepository: {
      upsert: vi.fn(),
      findByWorkflowId: vi.fn(async () => [task]),
      findByStatus: vi.fn(async () => [task]),
      findById: vi.fn(async () => task),
      deleteById: vi.fn(),
    },
    taskEdgesRepository: {
      insert: vi.fn(async (edge: TaskEdge) => {
        taskEdges.push(edge);
      }),
      insertMany: vi.fn(async (edges: readonly TaskEdge[]) => {
        taskEdges.push(...edges);
      }),
      findAllByWorkflowTasks: vi.fn(async () => taskEdges),
      findByFromTaskId: vi.fn(async () => []),
      findByToTaskId: vi.fn(async () => []),
      deleteByTaskId: vi.fn(async () => undefined),
    },
    schedulesRepository: {
      upsert: vi.fn(),
      findAll: vi.fn(async () => []),
      findEnabled: vi.fn(async () => []),
      findByTarget: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      deleteById: vi.fn(),
    },
    runsRepository: {
      upsert: vi.fn(),
      findByTaskId: vi.fn(async () => []),
      findByAgentId: vi.fn(async () => []),
      findByStatus: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      deleteById: vi.fn(),
    },
  };
}

describe("createDispatcher", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a DispatcherLike that dispatches through the bound enqueue port", async () => {
    const enqueuePort: DispatchEnqueuePort = {
      enqueueTaskDispatch: vi.fn(async () => ({
        ok: true,
        jobId: "job-1",
      })),
    };
    const dispatcher = createDispatcher(enqueuePort);
    const task = createTask();
    const agent = createAgent();

    const result = await dispatcher.dispatch(task, [agent], {
      triggerSource: "schedule",
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
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        workflowId: "workflow-1",
        agentId: "agent-1",
        triggerSource: "schedule",
      }),
    );
  });

  it("lets the dispatch route call the real dispatcher wrapper and pass triggerSource through", async () => {
    const enqueuePort: DispatchEnqueuePort = {
      enqueueTaskDispatch: vi.fn(async () => ({
        ok: true,
        jobId: "job-2",
      })),
    };
    const task = createTask();
    const agent = createAgent();
    const repositories = createRepositories(task, agent);
    const app = buildApp(
      createServerDependencies(repositories, createDispatcher(enqueuePort)),
    );

    const response = await app.inject({
      method: "POST",
      url: "/tasks/task-1/dispatch",
      payload: {
        triggerSource: "schedule",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerSource: "schedule",
      }),
    );
    expect(repositories.tasksRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        assigneeAgentId: "agent-1",
      }),
    );

    await app.close();
  });
});
