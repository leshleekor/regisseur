import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { bootstrapServer } from "./bootstrap.js";

function createEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/regisseur",
    REDIS_URL: "redis://localhost:6379",
    LOG_LEVEL: "silent",
    ...overrides,
  };
}

function createPool() {
  return {
    query: vi.fn(async () => ({ rows: [] }) as never),
    end: vi.fn(async () => undefined),
  };
}

function createQueueResources() {
  return {
    connection: {
      host: "localhost",
      port: 6379,
    },
    taskDispatchQueue: {
      add: vi.fn(async () => ({ id: "job-1", data: {} }) as never),
      close: vi.fn(async () => undefined),
    },
    scheduleTriggerQueue: {
      add: vi.fn(async () => ({ id: "schedule-job-1", data: {} }) as never),
      close: vi.fn(async () => undefined),
    },
    close: vi.fn(async () => undefined),
  };
}

function createWorkerResources() {
  return {
    taskDispatchWorker: {
      close: vi.fn(async () => undefined),
    },
    scheduleTriggerWorker: {
      close: vi.fn(async () => undefined),
    },
    close: vi.fn(async () => undefined),
  };
}

function createApp(): FastifyInstance {
  return {
    close: vi.fn(async () => undefined),
    listen: vi.fn(async () => undefined),
  } as unknown as FastifyInstance;
}

describe("bootstrapServer", () => {
  it("creates the app and runtime resources without listening", async () => {
    const pool = createPool();
    const queueResources = createQueueResources();
    const workerResources = createWorkerResources();
    const app = createApp();
    const registerShutdownHandlers = vi.fn(() => vi.fn());

    const result = await bootstrapServer({
      env: createEnv(),
      factories: {
        createPool: () => pool,
        createQueueResources: () => queueResources,
        createWorkerResources: vi.fn(() => workerResources),
        buildApp: vi.fn(() => app),
        registerShutdownHandlers,
      },
    });

    expect(result.app).toBe(app);
    expect(result.pool).toBe(pool);
    expect(result.queueResources).toBe(queueResources);
    expect(result.workerResources).toBe(workerResources);
    expect(registerShutdownHandlers).toHaveBeenCalledTimes(1);
    expect(app.listen).not.toHaveBeenCalled();
  });

  it("creates worker resources only when the factory is provided", async () => {
    const workerResources = createWorkerResources();

    const result = await bootstrapServer({
      env: createEnv(),
      factories: {
        createPool,
        createQueueResources,
        createWorkerResources: vi.fn(() => workerResources),
        buildApp: vi.fn(() => createApp()),
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    expect(result.workerResources).toBe(workerResources);
  });

  it("skips migrations when AUTO_MIGRATE is false", async () => {
    const runMigrations = vi.fn(async () => undefined);

    await bootstrapServer({
      env: createEnv({
        AUTO_MIGRATE: "false",
      }),
      factories: {
        createPool,
        createQueueResources,
        buildApp: vi.fn(() => createApp()),
        createWorkerResources: vi.fn(() => createWorkerResources()),
        runMigrations,
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    expect(runMigrations).not.toHaveBeenCalled();
  });

  it("runs migrations when AUTO_MIGRATE is true", async () => {
    const runMigrations = vi.fn(async () => undefined);

    await bootstrapServer({
      env: createEnv({
        AUTO_MIGRATE: "true",
      }),
      factories: {
        createPool,
        createQueueResources,
        createWorkerResources: vi.fn(() => createWorkerResources()),
        buildApp: vi.fn(() => createApp()),
        runMigrations,
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    expect(runMigrations).toHaveBeenCalledTimes(1);
  });

  it("replays enabled schedules during bootstrap", async () => {
    const pool = {
      query: vi.fn(async (text: string) => {
        const normalized = text.replace(/\s+/g, " ").trim();

        if (
          normalized ===
          "SELECT * FROM schedules WHERE enabled = TRUE ORDER BY created_at ASC"
        ) {
          return {
            rows: [
              {
                schedule_id: "schedule-1",
                type: "once",
                cron_expression: null,
                run_at: "2026-03-15T01:00:00.000Z",
                timezone: null,
                enabled: true,
                target_type: "workflow",
                target_id: "workflow-1",
                created_at: "2026-03-15T00:00:00.000Z",
                updated_at: "2026-03-15T00:00:00.000Z",
              },
            ],
          } as never;
        }

        return {
          rows: [],
        } as never;
      }),
      end: vi.fn(async () => undefined),
    };
    const queueResources = createQueueResources();

    await bootstrapServer({
      env: createEnv(),
      factories: {
        createPool: () => pool,
        createQueueResources: () => queueResources,
        createWorkerResources: vi.fn(() => createWorkerResources()),
        buildApp: vi.fn(() => createApp()),
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    expect(queueResources.scheduleTriggerQueue.add).toHaveBeenCalledTimes(1);
  });

  it("fails startup and closes resources when migration fails", async () => {
    const pool = createPool();
    const queueResources = createQueueResources();
    const workerResources = createWorkerResources();
    const runMigrations = vi.fn(async () => {
      throw new Error("migration failed");
    });

    await expect(
      bootstrapServer({
        env: createEnv({
          AUTO_MIGRATE: "true",
        }),
        factories: {
          createPool: () => pool,
          createQueueResources: () => queueResources,
          createWorkerResources: vi.fn(() => workerResources),
          buildApp: vi.fn(() => createApp()),
          runMigrations,
          registerShutdownHandlers: () => vi.fn(),
        },
      }),
    ).rejects.toThrow("migration failed");
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(queueResources.close).toHaveBeenCalledTimes(1);
    expect(workerResources.close).toHaveBeenCalledTimes(1);
  });

  it("closes worker resources too when bootstrap fails after worker creation", async () => {
    const pool = createPool();
    const queueResources = createQueueResources();
    const workerResources = createWorkerResources();

    await expect(
      bootstrapServer({
        env: createEnv(),
        factories: {
          createPool: () => pool,
          createQueueResources: () => queueResources,
          createWorkerResources: () => workerResources,
          buildApp: vi.fn(() => {
            throw new Error("build failed");
          }),
          registerShutdownHandlers: () => vi.fn(),
        },
      }),
    ).rejects.toThrow("build failed");

    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(queueResources.close).toHaveBeenCalledTimes(1);
    expect(workerResources.close).toHaveBeenCalledTimes(1);
  });
});
