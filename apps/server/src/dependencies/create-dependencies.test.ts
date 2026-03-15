import { describe, expect, it, vi } from "vitest";
import type { AgentDefinition, Task } from "@regisseur/core";
import type { TaskDispatchJobPayload } from "@regisseur/queue-bullmq";

import { createStandaloneServerDependencies } from "./create-dependencies.js";

function createConfig() {
  return {
    server: {
      host: "0.0.0.0",
      port: 3000,
    },
    databaseUrl: "postgres://postgres:postgres@localhost:5432/regisseur",
    redisUrl: "redis://localhost:6379",
    autoMigrate: false,
    logLevel: "silent",
    enableHttpAdapter: true,
    enableCliAdapter: false,
    enableOpenClawAdapter: true,
  } as const;
}

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

describe("createStandaloneServerDependencies", () => {
  it("composes repositories, dispatcher, enqueue port, logger, and adapter registry", async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [] }) as never),
      end: vi.fn(async () => undefined),
    };
    const queue = {
      add: vi.fn(
        async (_jobName: string, payload: TaskDispatchJobPayload) =>
          ({
            id: "job-1",
            data: payload,
          }) as never,
      ),
      close: vi.fn(async () => undefined),
    };
    const queueResources = {
      connection: {
        host: "localhost",
        port: 6379,
      },
      taskDispatchQueue: queue,
      close: vi.fn(async () => undefined),
    };
    const composition = createStandaloneServerDependencies({
      config: createConfig(),
      pool,
      queueResources,
    });

    expect(composition.dependencies.logger).toEqual({
      level: "silent",
    });
    expect(composition.adapterRegistry).toEqual({
      http: {
        runtimeType: "http",
      },
      openclaw: {
        runtimeType: "openclaw",
      },
    });
    expect(composition.workerResources).toBeUndefined();

    await composition.dispatcher.dispatch(createTask(), [createAgent()]);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      "task.dispatch",
      expect.objectContaining({
        taskId: "task-1",
        workflowId: "workflow-1",
      }),
      {
        jobId: "task-1",
      },
    );
  });

  it("includes workerResources only when explicitly provided or created", () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [] }) as never),
      end: vi.fn(async () => undefined),
    };
    const queueResources = {
      connection: {
        host: "localhost",
        port: 6379,
      },
      taskDispatchQueue: {
        add: vi.fn(),
        close: vi.fn(async () => undefined),
      },
      close: vi.fn(async () => undefined),
    };
    const workerResources = {
      taskDispatchWorker: {
        close: vi.fn(async () => undefined),
      },
      close: vi.fn(async () => undefined),
    };
    const composition = createStandaloneServerDependencies({
      config: createConfig(),
      pool,
      queueResources,
      createWorkerResources: vi.fn(() => workerResources),
    });

    expect(composition.workerResources).toBe(workerResources);
  });
});
