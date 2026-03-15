import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentDefinition } from "@regisseur/core";
import type { DispatcherLike } from "../types.js";

import { buildApp } from "../app.js";
import { createServerDependencies } from "../plugins/repositories.js";
import { createRepositories } from "./create-repositories.js";

function createQueryResult<T>(rows: T[]) {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  } as never;
}

function createDispatcherStub(): DispatcherLike {
  return {
    dispatch: vi.fn(async () => ({
      ok: false,
      taskId: "task-1",
      workflowId: "workflow-1",
      reason: "TASK_NOT_READY",
      message: "not used",
    })),
  };
}

describe("createRepositories", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the repository objects required by the app", () => {
    const db = {
      query: vi.fn(async () => createQueryResult([])),
    };

    const repositories = createRepositories(db);

    expect(typeof repositories.agentsRepository.findAll).toBe("function");
    expect(typeof repositories.workflowsRepository.findAll).toBe("function");
    expect(typeof repositories.tasksRepository.findById).toBe("function");
    expect(typeof repositories.taskEdgesRepository.findByFromTaskId).toBe(
      "function",
    );
    expect(typeof repositories.schedulesRepository.findAll).toBe("function");
    expect(typeof repositories.runsRepository.findByTaskId).toBe("function");
  });

  it("produces a repository shape that buildApp accepts", async () => {
    const db = {
      query: vi.fn(async () => createQueryResult([])),
    };

    const repositories = createRepositories(db);
    const app = buildApp(
      createServerDependencies(repositories, createDispatcherStub()),
    );

    await expect(
      app.inject({ method: "GET", url: "/health" }),
    ).resolves.toMatchObject({
      statusCode: 200,
    });

    await app.close();
  });

  it("lets route handlers use the injected real repository implementations", async () => {
    const db = {
      query: vi.fn(async () => createQueryResult([])),
    };
    const repositories = createRepositories(db);
    const app = buildApp(
      createServerDependencies(repositories, createDispatcherStub()),
    );
    const agent: AgentDefinition = {
      agentId: "agent-1",
      name: "Agent One",
      runtimeType: "cli",
      capabilities: [],
      enabled: true,
      config: {},
    };

    const response = await app.inject({
      method: "POST",
      url: "/agents",
      payload: agent,
    });

    expect(response.statusCode).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(String(db.query.mock.calls[0]?.[0])).toContain("INSERT INTO agents");

    await app.close();
  });
});
