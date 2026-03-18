import { describe, expect, it, vi } from "vitest";
import type {
  ScheduleTriggerJobPayload,
  TaskDispatchJobPayload,
} from "@regisseur/queue-bullmq";

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

describe("createStandaloneServerDependencies", () => {
  it("composes repositories, enqueue path, logger, adapter registry, and worker resources", async () => {
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
    const scheduleQueue = {
      add: vi.fn(
        async (_jobName: string, payload: ScheduleTriggerJobPayload) =>
          ({
            id: "schedule-job-1",
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
      scheduleTriggerQueue: scheduleQueue,
      close: vi.fn(async () => undefined),
    };
    const workerResources = {
      taskDispatchWorker: {
        close: vi.fn(async () => undefined),
      },
      scheduleTriggerWorker: {
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

    expect(composition.dependencies.logger).toEqual({
      level: "silent",
    });
    expect(composition.executableAdapterRegistry.http?.runtimeType).toBe(
      "http",
    );
    expect(composition.executableAdapterRegistry.openclaw?.runtimeType).toBe(
      "openclaw",
    );
    expect(composition.workerResources).toBe(workerResources);
    expect(composition.dependencies.scheduleRegistrationPort).toBeDefined();

    await composition.enqueuePort.enqueueTaskDispatch({
      taskId: "task-1",
      workflowId: "workflow-1",
      agentId: "agent-1",
      triggerSource: "manual",
      requestedAt: "2026-03-15T00:00:00.000Z",
    });

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
      scheduleTriggerQueue: {
        add: vi.fn(),
        close: vi.fn(async () => undefined),
      },
      close: vi.fn(async () => undefined),
    };
    const workerResources = {
      taskDispatchWorker: {
        close: vi.fn(async () => undefined),
      },
      scheduleTriggerWorker: {
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
