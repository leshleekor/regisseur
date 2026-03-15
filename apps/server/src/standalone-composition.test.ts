import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRow, Queryable, TaskRow } from "@regisseur/store-postgres";
import type { TaskDispatchJobPayload } from "@regisseur/queue-bullmq";

import { bootstrapServer } from "./bootstrap.js";

function createQueryResult<T>(rows: T[]) {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  } as never;
}

function normalizeQuery(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function createPgError(
  code: string,
  message = `pg error ${code}`,
): Error & {
  code: string;
} {
  const error = new Error(message) as Error & { code: string };

  error.code = code;
  return error;
}

function createInMemoryPool() {
  const agents = new Map<string, AgentRow>();
  const tasks = new Map<string, TaskRow>();
  let failNextQuery: (Error & { code?: string }) | null = null;
  const pool: Queryable & {
    end: ReturnType<typeof vi.fn>;
  } = {
    query: vi.fn(async (text: string, values: readonly unknown[] = []) => {
      if (failNextQuery) {
        const error = failNextQuery;

        failNextQuery = null;
        throw error;
      }

      const sql = normalizeQuery(text);

      if (sql.includes("INSERT INTO agents")) {
        const [agentId, name, runtimeType, capabilities, enabled, config] =
          values;
        const now = "2026-03-15T00:00:00.000Z";

        agents.set(String(agentId), {
          agent_id: String(agentId),
          name: String(name),
          runtime_type: String(runtimeType),
          capabilities: JSON.parse(String(capabilities)),
          enabled: Boolean(enabled),
          config: JSON.parse(String(config)),
          created_at: now,
          updated_at: now,
        });

        return createQueryResult([]);
      }

      if (sql === "SELECT * FROM agents ORDER BY created_at ASC") {
        return createQueryResult(Array.from(agents.values()));
      }

      if (sql === "SELECT * FROM tasks WHERE task_id = $1") {
        const task = tasks.get(String(values[0]));

        return createQueryResult(task ? [task] : []);
      }

      if (sql.includes("INSERT INTO tasks") && sql.includes("ON CONFLICT")) {
        const [
          taskId,
          workflowId,
          title,
          payload,
          status,
          assigneeAgentId,
          retryCount,
          concurrencyKey,
          metadata,
          createdAt,
          updatedAt,
        ] = values;

        tasks.set(String(taskId), {
          task_id: String(taskId),
          workflow_id: String(workflowId),
          title: String(title),
          payload: JSON.parse(String(payload)),
          status: String(status),
          assignee_agent_id:
            assigneeAgentId === null ? null : String(assigneeAgentId),
          retry_count: Number(retryCount),
          concurrency_key:
            concurrencyKey === null ? null : String(concurrencyKey),
          metadata: metadata === null ? null : JSON.parse(String(metadata)),
          created_at: String(createdAt),
          updated_at: String(updatedAt),
        });

        return createQueryResult([]);
      }

      throw new Error(`Unexpected query: ${sql}`);
    }),
    end: vi.fn(async () => undefined),
  };

  return {
    pool,
    state: {
      agents,
      tasks,
      setFailNextQuery(error: Error & { code?: string }) {
        failNextQuery = error;
      },
    },
  };
}

function createQueueResources() {
  const jobs: TaskDispatchJobPayload[] = [];
  const addCalls: unknown[][] = [];
  const taskDispatchQueue = {
    add: vi.fn(
      async (
        _jobName: string,
        payload: TaskDispatchJobPayload,
        options?: unknown,
      ) => {
        addCalls.push([_jobName, payload, options]);
        jobs.push(payload);

        return {
          id: `job-${jobs.length}`,
          data: payload,
        } as never;
      },
    ),
    close: vi.fn(async () => undefined),
  };

  return {
    queueResources: {
      connection: {
        host: "localhost",
        port: 6379,
      },
      taskDispatchQueue,
      close: vi.fn(async () => undefined),
    },
    jobs,
    addCalls,
  };
}

function createEnv() {
  return {
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/regisseur",
    REDIS_URL: "redis://localhost:6379",
    LOG_LEVEL: "silent",
  };
}

describe("standalone runtime composition", () => {
  let shutdowns: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.allSettled(shutdowns.map((shutdown) => shutdown()));
    shutdowns = [];
  });

  it("serves /health through the real composition path", async () => {
    const { pool } = createInMemoryPool();
    const { queueResources } = createQueueResources();
    const result = await bootstrapServer({
      env: createEnv(),
      factories: {
        createPool: () => pool,
        createQueueResources: () => queueResources,
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    shutdowns.push(() => result.shutdown.shutdown());

    const response = await result.app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
    });
  });

  it("supports a minimal CRUD route with real composition and fake infra", async () => {
    const { pool } = createInMemoryPool();
    const { queueResources } = createQueueResources();
    const result = await bootstrapServer({
      env: createEnv(),
      factories: {
        createPool: () => pool,
        createQueueResources: () => queueResources,
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    shutdowns.push(() => result.shutdown.shutdown());

    const createResponse = await result.app.inject({
      method: "POST",
      url: "/agents",
      payload: {
        agentId: "agent-1",
        name: "Agent One",
        runtimeType: "cli",
        capabilities: [],
        enabled: true,
        config: {},
      },
    });
    const listResponse = await result.app.inject({
      method: "GET",
      url: "/agents",
    });

    expect(createResponse.statusCode).toBe(200);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      {
        agentId: "agent-1",
        name: "Agent One",
        runtimeType: "cli",
        capabilities: [],
        enabled: true,
        config: {},
      },
    ]);
  });

  it("wires dispatch through the real composition path and fake queue", async () => {
    const { pool, state } = createInMemoryPool();
    const { queueResources, jobs, addCalls } = createQueueResources();

    state.agents.set("agent-1", {
      agent_id: "agent-1",
      name: "Agent One",
      runtime_type: "cli",
      capabilities: [],
      enabled: true,
      config: {},
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z",
    });
    state.tasks.set("task-1", {
      task_id: "task-1",
      workflow_id: "workflow-1",
      title: "Task One",
      payload: {},
      status: "ready",
      assignee_agent_id: null,
      retry_count: 0,
      concurrency_key: null,
      metadata: null,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z",
    });

    const result = await bootstrapServer({
      env: createEnv(),
      factories: {
        createPool: () => pool,
        createQueueResources: () => queueResources,
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    shutdowns.push(() => result.shutdown.shutdown());

    const response = await result.app.inject({
      method: "POST",
      url: "/tasks/task-1/dispatch",
      payload: {
        triggerSource: "manual",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(jobs).toEqual([
      {
        taskId: "task-1",
        workflowId: "workflow-1",
        triggerSource: "manual",
        requestedAt: expect.any(String),
      },
    ]);
    expect(addCalls[0]?.[2]).toEqual({
      jobId: "task-1",
    });
    expect(state.tasks.get("task-1")).toMatchObject({
      status: "queued",
      assignee_agent_id: "agent-1",
    });
  });

  it("keeps the error response shape when the real composition hits a pg conflict", async () => {
    const { pool, state } = createInMemoryPool();
    const { queueResources } = createQueueResources();

    state.setFailNextQuery(createPgError("23505", "duplicate agent"));

    const result = await bootstrapServer({
      env: createEnv(),
      factories: {
        createPool: () => pool,
        createQueueResources: () => queueResources,
        registerShutdownHandlers: () => vi.fn(),
      },
    });

    shutdowns.push(() => result.shutdown.shutdown());

    const response = await result.app.inject({
      method: "POST",
      url: "/agents",
      payload: {
        agentId: "agent-1",
        name: "Agent One",
        runtimeType: "cli",
        capabilities: [],
        enabled: true,
        config: {},
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "CONFLICT",
        message: "Request conflicts with existing data",
      },
    });
  });
});
