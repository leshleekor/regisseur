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
    close: vi.fn(async () => undefined),
  };
}

function createWorkerResources() {
  return {
    taskDispatchWorker: {
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
    const app = createApp();
    const registerShutdownHandlers = vi.fn(() => vi.fn());

    const result = await bootstrapServer({
      env: createEnv(),
      factories: {
        createPool: () => pool,
        createQueueResources: () => queueResources,
        buildApp: vi.fn(() => app),
        registerShutdownHandlers,
      },
    });

    expect(result.app).toBe(app);
    expect(result.pool).toBe(pool);
    expect(result.queueResources).toBe(queueResources);
    expect(result.workerResources).toBeUndefined();
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
        buildApp: vi.fn(() => createApp()),
        runMigrations,
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    expect(runMigrations).toHaveBeenCalledTimes(1);
  });

  it("fails startup and closes resources when migration fails", async () => {
    const pool = createPool();
    const queueResources = createQueueResources();
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
          buildApp: vi.fn(() => createApp()),
          runMigrations,
          registerShutdownHandlers: () => vi.fn(),
        },
      }),
    ).rejects.toThrow("migration failed");
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(queueResources.close).toHaveBeenCalledTimes(1);
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
