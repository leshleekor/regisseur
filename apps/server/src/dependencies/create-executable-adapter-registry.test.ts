import { describe, expect, it, vi } from "vitest";
import type { AgentDefinition, Task } from "@regisseur/core";

import { createExecutableAdapterRegistry } from "./create-executable-adapter-registry.js";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: "task-1",
    workflowId: "workflow-1",
    title: "task-1",
    payload: { prompt: "hello" },
    status: "running",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createAgent(
  runtimeType: AgentDefinition["runtimeType"],
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    agentId: `${runtimeType}-agent`,
    name: `${runtimeType}-agent`,
    runtimeType,
    capabilities: [],
    enabled: true,
    config:
      runtimeType === "http"
        ? {
            url: "https://example.test/run",
          }
        : runtimeType === "cli"
          ? {
              command: "echo",
            }
          : {
              command: "openclaw",
            },
    ...overrides,
  };
}

describe("createExecutableAdapterRegistry", () => {
  it("binds the HTTP adapter for http agents", async () => {
    const httpTransport = {
      execute: vi.fn(async () => ({
        ok: true as const,
        status: 200,
        bodyText: '{"result":"ok"}',
        headers: {},
      })),
    };
    const registry = createExecutableAdapterRegistry({
      enableHttpAdapter: true,
      enableCliAdapter: false,
      enableOpenClawAdapter: false,
      httpTransport,
    });

    const result = await registry.http?.execute(
      createTask(),
      createAgent("http"),
    );

    expect(result).toEqual({
      ok: true,
      externalRunId: undefined,
      output: { result: "ok" },
    });
    expect(httpTransport.execute).toHaveBeenCalledTimes(1);
  });

  it("binds the CLI adapter for cli agents", async () => {
    const cliTransport = {
      execute: vi.fn(async () => ({
        ok: true as const,
        exitCode: 0,
        stdout: '{"result":"ok"}',
        stderr: "",
      })),
    };
    const registry = createExecutableAdapterRegistry({
      enableHttpAdapter: false,
      enableCliAdapter: true,
      enableOpenClawAdapter: false,
      cliTransport,
    });

    const result = await registry.cli?.execute(
      createTask(),
      createAgent("cli"),
    );

    expect(result).toEqual({
      ok: true,
      externalRunId: undefined,
      output: { result: "ok" },
    });
    expect(cliTransport.execute).toHaveBeenCalledTimes(1);
  });

  it("binds the OpenClaw adapter for openclaw agents", async () => {
    const openClawTransport = {
      execute: vi.fn(async () => ({
        ok: true as const,
        exitCode: 0,
        stdout: '{"result":"ok"}',
        stderr: "",
      })),
    };
    const registry = createExecutableAdapterRegistry({
      enableHttpAdapter: false,
      enableCliAdapter: false,
      enableOpenClawAdapter: true,
      openClawTransport,
    });

    const result = await registry.openclaw?.execute(
      createTask(),
      createAgent("openclaw"),
    );

    expect(result).toEqual({
      ok: true,
      externalRunId: undefined,
      output: { result: "ok" },
    });
    expect(openClawTransport.execute).toHaveBeenCalledTimes(1);
  });
});
