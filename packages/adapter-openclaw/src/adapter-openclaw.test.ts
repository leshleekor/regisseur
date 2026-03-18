import { describe, expect, it, vi } from "vitest";
import type { AgentDefinition, Task } from "@regisseur/core";

import { executeWithOpenClawAdapter } from "./adapter.js";
import { parseOpenClawConfig } from "./config.js";
import { createOpenClawExecutionRequest } from "./request-mapper.js";
import { mapTransportResultToExecutionResult } from "./response-mapper.js";
import type { OpenClawTransportPort } from "./ports.js";

function createAgent(
  agentId: string,
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    agentId,
    name: agentId,
    runtimeType: "openclaw",
    capabilities: [],
    enabled: true,
    config: {
      command: "openclaw",
    },
    ...overrides,
  };
}

function createTask(
  taskId: string,
  workflowId: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    taskId,
    workflowId,
    title: taskId,
    payload: {
      input: true,
    },
    status: "ready",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseOpenClawConfig", () => {
  it("throws when runtimeType is not openclaw", () => {
    expect(() =>
      parseOpenClawConfig(
        createAgent("agent-1", {
          runtimeType: "cli",
        }),
      ),
    ).toThrow("does not use the openclaw runtime");
  });

  it("throws when command is missing", () => {
    expect(() =>
      parseOpenClawConfig(
        createAgent("agent-1", {
          config: {},
        }),
      ),
    ).toThrow("command is required");
  });

  it("parses args when they are a string array", () => {
    expect(
      parseOpenClawConfig(
        createAgent("agent-1", {
          config: {
            command: "openclaw",
            args: ["run", "--json"],
          },
        }),
      ),
    ).toMatchObject({
      command: "openclaw",
      args: ["run", "--json"],
    });
  });

  it("throws when args is not a string array", () => {
    expect(() =>
      parseOpenClawConfig(
        createAgent("agent-1", {
          config: {
            command: "openclaw",
            args: "run",
          },
        }),
      ),
    ).toThrow("args must be a string array");
  });

  it("parses env when it is a string map", () => {
    expect(
      parseOpenClawConfig(
        createAgent("agent-1", {
          config: {
            command: "openclaw",
            env: {
              OPENCLAW_PROFILE: "default",
            },
          },
        }),
      ),
    ).toMatchObject({
      env: {
        OPENCLAW_PROFILE: "default",
      },
    });
  });

  it("throws when env contains a non-string value", () => {
    expect(() =>
      parseOpenClawConfig(
        createAgent("agent-1", {
          config: {
            command: "openclaw",
            env: {
              OPENCLAW_PROFILE: 1,
            },
          },
        }),
      ),
    ).toThrow("env must contain only string values");
  });

  it("supports missing optional fields", () => {
    expect(parseOpenClawConfig(createAgent("agent-1"))).toEqual({
      command: "openclaw",
      args: [],
      workingDirectory: undefined,
      env: undefined,
      agentName: undefined,
      mode: "command",
    });
  });

  it("defaults mode to command", () => {
    expect(parseOpenClawConfig(createAgent("agent-1")).mode).toBe("command");
  });
});

describe("createOpenClawExecutionRequest", () => {
  it("creates an execution request from task, agent, and parsed config", () => {
    const task = createTask("task-1", "workflow-1");
    const agent = createAgent("agent-1");
    const config = parseOpenClawConfig(
      createAgent("agent-1", {
        config: {
          command: "openclaw",
          args: ["run"],
          workingDirectory: "/tmp/openclaw",
          env: {
            OPENCLAW_PROFILE: "default",
          },
        },
      }),
    );

    expect(createOpenClawExecutionRequest(task, agent, config)).toEqual({
      command: "openclaw",
      args: ["run"],
      workingDirectory: "/tmp/openclaw",
      env: {
        OPENCLAW_PROFILE: "default",
      },
      input: {
        taskId: "task-1",
        workflowId: "workflow-1",
        title: "task-1",
        payload: {
          input: true,
        },
        agentId: "agent-1",
        agentName: undefined,
      },
    });
  });

  it("includes agentName when present in config", () => {
    const task = createTask("task-1", "workflow-1");
    const agent = createAgent("agent-1");
    const config = parseOpenClawConfig(
      createAgent("agent-1", {
        config: {
          command: "openclaw",
          agentName: "reviewer",
        },
      }),
    );

    expect(
      createOpenClawExecutionRequest(task, agent, config).input.agentName,
    ).toBe("reviewer");
  });

  it("preserves deeply nested task payloads without loss", () => {
    const task = createTask("task-1", "workflow-1", {
      payload: {
        nested: {
          items: ["a", "b"],
          flags: {
            dryRun: true,
          },
        },
      },
    });
    const request = createOpenClawExecutionRequest(
      task,
      createAgent("agent-1"),
      parseOpenClawConfig(createAgent("agent-1")),
    );

    expect(request.input.taskId).toBe("task-1");
    expect(request.input.workflowId).toBe("workflow-1");
    expect(request.input.title).toBe("task-1");
    expect(request.input.payload).toEqual({
      nested: {
        items: ["a", "b"],
        flags: {
          dryRun: true,
        },
      },
    });
  });
});

describe("mapTransportResultToExecutionResult", () => {
  it("maps transport failures to TRANSPORT_ERROR", () => {
    expect(
      mapTransportResultToExecutionResult({
        ok: false,
        message: "spawn failed",
        stdout: "partial stdout",
        stderr: "partial stderr",
      }),
    ).toEqual({
      ok: false,
      reason: "TRANSPORT_ERROR",
      message: "spawn failed",
      rawStdout: "partial stdout",
      rawStderr: "partial stderr",
    });
  });

  it("maps exitCode 0 and JSON stdout to a success result with parsed output", () => {
    expect(
      mapTransportResultToExecutionResult({
        ok: true,
        stdout: '{"result":"ok"}',
        stderr: "",
        exitCode: 0,
      }),
    ).toEqual({
      ok: true,
      output: {
        result: "ok",
      },
      rawStdout: '{"result":"ok"}',
      rawStderr: "",
    });
  });

  it("keeps success when stdout is not JSON", () => {
    expect(
      mapTransportResultToExecutionResult({
        ok: true,
        stdout: "plain text output",
        stderr: "",
        exitCode: 0,
      }),
    ).toEqual({
      ok: true,
      output: undefined,
      rawStdout: "plain text output",
      rawStderr: "",
    });
  });

  it("maps non-zero exit codes to EXECUTION_FAILED", () => {
    expect(
      mapTransportResultToExecutionResult({
        ok: true,
        stdout: '{"result":"partial"}',
        stderr: "boom",
        exitCode: 17,
      }),
    ).toEqual({
      ok: false,
      reason: "EXECUTION_FAILED",
      message: "OpenClaw execution exited with code 17",
      rawStdout: '{"result":"partial"}',
      rawStderr: "boom",
    });
  });

  it("allows success results without externalRunId", () => {
    const result = mapTransportResultToExecutionResult({
      ok: true,
      stdout: "{}",
      stderr: "",
      exitCode: 0,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.externalRunId).toBeUndefined();
    }
  });
});

describe("executeWithOpenClawAdapter", () => {
  it("returns success for a valid agent, task, and transport result", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(async () => ({
        ok: true,
        stdout: '{"result":"ok"}',
        stderr: "",
        exitCode: 0,
      })),
    };

    const result = await executeWithOpenClawAdapter(
      createTask("task-1", "workflow-1"),
      createAgent("agent-1", {
        config: {
          command: "openclaw",
          args: ["run"],
          env: {
            OPENCLAW_PROFILE: "default",
          },
          workingDirectory: "/tmp/openclaw",
          agentName: "reviewer",
        },
      }),
      transport,
    );

    expect(result).toEqual({
      ok: true,
      output: {
        result: "ok",
      },
      rawStdout: '{"result":"ok"}',
      rawStderr: "",
    });
    expect(transport.execute).toHaveBeenCalledTimes(1);
    expect(transport.execute).toHaveBeenCalledWith({
      command: "openclaw",
      args: ["run"],
      workingDirectory: "/tmp/openclaw",
      env: {
        OPENCLAW_PROFILE: "default",
      },
      input: {
        taskId: "task-1",
        workflowId: "workflow-1",
        title: "task-1",
        payload: {
          input: true,
        },
        agentId: "agent-1",
        agentName: "reviewer",
      },
    });
  });

  it("keeps success when stdout is not JSON but exitCode is 0", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(async () => ({
        ok: true,
        stdout: "completed",
        stderr: "",
        exitCode: 0,
      })),
    };

    const result = await executeWithOpenClawAdapter(
      createTask("task-1", "workflow-1"),
      createAgent("agent-1"),
      transport,
    );

    expect(result).toEqual({
      ok: true,
      output: undefined,
      rawStdout: "completed",
      rawStderr: "",
    });
  });

  it("allows externalRunId to remain undefined on success", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(async () => ({
        ok: true,
        stdout: "{}",
        stderr: "",
        exitCode: 0,
      })),
    };

    const result = await executeWithOpenClawAdapter(
      createTask("task-1", "workflow-1"),
      createAgent("agent-1"),
      transport,
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.externalRunId).toBeUndefined();
    }
  });

  it("returns INVALID_AGENT_RUNTIME when runtimeType is not openclaw", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(),
    };

    const result = await executeWithOpenClawAdapter(
      createTask("task-1", "workflow-1"),
      createAgent("agent-1", {
        runtimeType: "cli",
      }),
      transport,
    );

    expect(result).toEqual({
      ok: false,
      reason: "INVALID_AGENT_RUNTIME",
      message: "Agent agent-1 does not use the openclaw runtime",
    });
    expect(transport.execute).not.toHaveBeenCalled();
  });

  it("returns INVALID_AGENT_CONFIG when config is invalid", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(),
    };

    const result = await executeWithOpenClawAdapter(
      createTask("task-1", "workflow-1"),
      createAgent("agent-1", {
        config: {
          command: 42,
        },
      }),
      transport,
    );

    expect(result).toEqual({
      ok: false,
      reason: "INVALID_AGENT_CONFIG",
      message: "OpenClaw config field command must be a non-empty string",
    });
    expect(transport.execute).not.toHaveBeenCalled();
  });

  it("returns TRANSPORT_ERROR when the transport reports failure", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(async () => ({
        ok: false,
        message: "spawn failed",
        stdout: "partial stdout",
        stderr: "partial stderr",
      })),
    };

    const result = await executeWithOpenClawAdapter(
      createTask("task-1", "workflow-1"),
      createAgent("agent-1"),
      transport,
    );

    expect(result).toEqual({
      ok: false,
      reason: "TRANSPORT_ERROR",
      message: "spawn failed",
      rawStdout: "partial stdout",
      rawStderr: "partial stderr",
    });
  });

  it("returns EXECUTION_FAILED when exitCode is non-zero", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(async () => ({
        ok: true,
        stdout: "partial stdout",
        stderr: "partial stderr",
        exitCode: 9,
      })),
    };

    const result = await executeWithOpenClawAdapter(
      createTask("task-1", "workflow-1"),
      createAgent("agent-1"),
      transport,
    );

    expect(result).toEqual({
      ok: false,
      reason: "EXECUTION_FAILED",
      message: "OpenClaw execution exited with code 9",
      rawStdout: "partial stdout",
      rawStderr: "partial stderr",
    });
  });

  it("returns TRANSPORT_ERROR instead of throwing raw transport exceptions", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(async () => {
        throw new Error("transport exploded");
      }),
    };

    await expect(
      executeWithOpenClawAdapter(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        transport,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: "TRANSPORT_ERROR",
      message: "transport exploded",
    });
  });

  it("returns INVALID_AGENT_CONFIG when parsing throws before transport execution", async () => {
    const transport: OpenClawTransportPort = {
      execute: vi.fn(),
    };

    const result = await executeWithOpenClawAdapter(
      createTask("task-1", "workflow-1"),
      createAgent("agent-1", {
        config: {
          command: "openclaw",
          env: {
            OPENCLAW_PROFILE: true,
          },
        },
      }),
      transport,
    );

    expect(result).toEqual({
      ok: false,
      reason: "INVALID_AGENT_CONFIG",
      message: "OpenClaw config field env must contain only string values",
    });
    expect(transport.execute).not.toHaveBeenCalled();
  });
});
