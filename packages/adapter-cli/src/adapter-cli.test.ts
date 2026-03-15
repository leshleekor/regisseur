import { describe, expect, it, vi } from "vitest";
import type { AgentDefinition, Task } from "@regisseur/core";

import { executeWithCliAdapter } from "./adapter.js";
import { parseCliConfig } from "./config.js";
import { createCliExecutionRequest } from "./request-mapper.js";
import { mapCliTransportResultToExecutionResult } from "./response-mapper.js";
import type { CliTransportPort } from "./ports.js";

function createAgent(
  agentId: string,
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    agentId,
    name: `${agentId}-name`,
    runtimeType: "cli",
    capabilities: [],
    enabled: true,
    config: {
      command: "runner",
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
      nested: {
        value: true,
      },
    },
    status: "ready",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("adapter-cli", () => {
  describe("parseCliConfig", () => {
    it("throws when runtimeType is not cli", () => {
      expect(() =>
        parseCliConfig(
          createAgent("agent-1", {
            runtimeType: "http",
          }),
        ),
      ).toThrow("does not use the cli runtime");
    });

    it("throws when command is missing", () => {
      expect(() =>
        parseCliConfig(
          createAgent("agent-1", {
            config: {},
          }),
        ),
      ).toThrow("command must be a non-empty string");
    });

    it("parses args when they are a string array", () => {
      expect(
        parseCliConfig(
          createAgent("agent-1", {
            config: {
              command: "runner",
              args: ["run", "--json"],
            },
          }),
        ).args,
      ).toEqual(["run", "--json"]);
    });

    it("throws when args is not a string array", () => {
      expect(() =>
        parseCliConfig(
          createAgent("agent-1", {
            config: {
              command: "runner",
              args: "run",
            },
          }),
        ),
      ).toThrow("args must be a string array");
    });

    it("parses env when it is a string map", () => {
      expect(
        parseCliConfig(
          createAgent("agent-1", {
            config: {
              command: "runner",
              env: {
                PROFILE: "default",
              },
            },
          }),
        ).env,
      ).toEqual({
        PROFILE: "default",
      });
    });

    it("throws when env contains non-string values", () => {
      expect(() =>
        parseCliConfig(
          createAgent("agent-1", {
            config: {
              command: "runner",
              env: {
                PROFILE: 1,
              },
            },
          }),
        ),
      ).toThrow("env must contain only string values");
    });

    it("defaults inputMode to stdin", () => {
      expect(parseCliConfig(createAgent("agent-1")).inputMode).toBe("stdin");
    });

    it("parses optional fields when they are omitted", () => {
      expect(parseCliConfig(createAgent("agent-1"))).toEqual({
        command: "runner",
        args: [],
        workingDirectory: undefined,
        env: undefined,
        inputMode: "stdin",
        agentName: undefined,
      });
    });

    it("throws when inputMode is unsupported", () => {
      expect(() =>
        parseCliConfig(
          createAgent("agent-1", {
            config: {
              command: "runner",
              inputMode: "pipe",
            },
          }),
        ),
      ).toThrow("inputMode must be stdin");
    });
  });

  describe("createCliExecutionRequest", () => {
    it("creates a CLI execution request from task, agent, and parsed config", () => {
      const task = createTask("task-1", "workflow-1");
      const agent = createAgent("agent-1");
      const config = parseCliConfig(
        createAgent("agent-1", {
          config: {
            command: "runner",
            args: ["run"],
            workingDirectory: "/tmp/runner",
            env: {
              PROFILE: "default",
            },
          },
        }),
      );

      expect(createCliExecutionRequest(task, agent, config)).toEqual({
        command: "runner",
        args: ["run"],
        workingDirectory: "/tmp/runner",
        env: {
          PROFILE: "default",
        },
        stdinInput: {
          taskId: "task-1",
          workflowId: "workflow-1",
          title: "task-1",
          payload: {
            nested: {
              value: true,
            },
          },
          agentId: "agent-1",
        },
      });
    });

    it("includes agentName when present in config", () => {
      const request = createCliExecutionRequest(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        parseCliConfig(
          createAgent("agent-1", {
            config: {
              command: "runner",
              agentName: "shell-runner",
            },
          }),
        ),
      );

      expect(request.stdinInput.agentName).toBe("shell-runner");
    });

    it("preserves nested payloads in stdinInput", () => {
      const request = createCliExecutionRequest(
        createTask("task-1", "workflow-1", {
          payload: {
            nested: {
              values: ["a", "b"],
            },
          },
        }),
        createAgent("agent-1"),
        parseCliConfig(createAgent("agent-1")),
      );

      expect(request.stdinInput.payload).toEqual({
        nested: {
          values: ["a", "b"],
        },
      });
    });

    it("keeps stdin input explicit in the request shape", () => {
      const request = createCliExecutionRequest(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        parseCliConfig(createAgent("agent-1")),
      );

      expect("stdinInput" in request).toBe(true);
    });
  });

  describe("mapCliTransportResultToExecutionResult", () => {
    it("maps transport failures to TRANSPORT_ERROR", () => {
      expect(
        mapCliTransportResultToExecutionResult({
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

    it("maps exitCode 0 and JSON stdout to success with parsed output", () => {
      expect(
        mapCliTransportResultToExecutionResult({
          ok: true,
          stdout: '{"result":"ok"}',
          stderr: "",
          exitCode: 0,
        }),
      ).toEqual({
        ok: true,
        externalRunId: undefined,
        output: {
          result: "ok",
        },
        rawStdout: '{"result":"ok"}',
        rawStderr: "",
      });
    });

    it("keeps success when stdout is not JSON", () => {
      expect(
        mapCliTransportResultToExecutionResult({
          ok: true,
          stdout: "plain stdout",
          stderr: "",
          exitCode: 0,
        }),
      ).toEqual({
        ok: true,
        externalRunId: undefined,
        output: undefined,
        rawStdout: "plain stdout",
        rawStderr: "",
      });
    });

    it("maps non-zero exit codes to EXECUTION_FAILED", () => {
      expect(
        mapCliTransportResultToExecutionResult({
          ok: true,
          stdout: "partial stdout",
          stderr: "boom",
          exitCode: 7,
        }),
      ).toEqual({
        ok: false,
        reason: "EXECUTION_FAILED",
        message: "CLI execution exited with code 7",
        rawStdout: "partial stdout",
        rawStderr: "boom",
      });
    });

    it("uses runId as a fallback externalRunId", () => {
      const result = mapCliTransportResultToExecutionResult({
        ok: true,
        stdout: '{"runId":"run-1"}',
        stderr: "",
        exitCode: 0,
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.externalRunId).toBe("run-1");
      }
    });

    it("uses externalRunId when present", () => {
      const result = mapCliTransportResultToExecutionResult({
        ok: true,
        stdout: '{"externalRunId":"external-1"}',
        stderr: "",
        exitCode: 0,
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.externalRunId).toBe("external-1");
      }
    });

    it("keeps externalRunId undefined when no execution id exists", () => {
      const result = mapCliTransportResultToExecutionResult({
        ok: true,
        stdout: '{"result":"ok"}',
        stderr: "",
        exitCode: 0,
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.externalRunId).toBeUndefined();
      }
    });

    it("prefers externalRunId over runId when both are present", () => {
      const result = mapCliTransportResultToExecutionResult({
        ok: true,
        stdout: '{"externalRunId":"external-1","runId":"run-1"}',
        stderr: "",
        exitCode: 0,
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.externalRunId).toBe("external-1");
      }
    });
  });

  describe("executeWithCliAdapter", () => {
    it("returns success for a valid cli agent, task, and transport result", async () => {
      const transport: CliTransportPort = {
        execute: vi.fn(async () => ({
          ok: true,
          stdout: '{"result":"ok","externalRunId":"external-1"}',
          stderr: "",
          exitCode: 0,
        })),
      };

      const result = await executeWithCliAdapter(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1", {
          config: {
            command: "runner",
            args: ["run"],
            workingDirectory: "/tmp/runner",
            env: {
              PROFILE: "default",
            },
            agentName: "shell-runner",
          },
        }),
        transport,
      );

      expect(result).toEqual({
        ok: true,
        externalRunId: "external-1",
        output: {
          result: "ok",
          externalRunId: "external-1",
        },
        rawStdout: '{"result":"ok","externalRunId":"external-1"}',
        rawStderr: "",
      });
      expect(transport.execute).toHaveBeenCalledTimes(1);
      expect(transport.execute).toHaveBeenCalledWith({
        command: "runner",
        args: ["run"],
        workingDirectory: "/tmp/runner",
        env: {
          PROFILE: "default",
        },
        stdinInput: {
          taskId: "task-1",
          workflowId: "workflow-1",
          title: "task-1",
          payload: {
            nested: {
              value: true,
            },
          },
          agentId: "agent-1",
          agentName: "shell-runner",
        },
      });
    });

    it("returns INVALID_AGENT_RUNTIME for non-cli agents", async () => {
      const transport: CliTransportPort = {
        execute: vi.fn(),
      };

      const result = await executeWithCliAdapter(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1", {
          runtimeType: "http",
        }),
        transport,
      );

      expect(result).toEqual({
        ok: false,
        reason: "INVALID_AGENT_RUNTIME",
        message: "Agent agent-1 does not use the cli runtime",
      });
      expect(transport.execute).not.toHaveBeenCalled();
    });

    it("returns INVALID_AGENT_CONFIG for invalid config", async () => {
      const transport: CliTransportPort = {
        execute: vi.fn(),
      };

      const result = await executeWithCliAdapter(
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
        message: "CLI config field command must be a non-empty string",
      });
      expect(transport.execute).not.toHaveBeenCalled();
    });

    it("returns TRANSPORT_ERROR when the transport reports failure", async () => {
      const transport: CliTransportPort = {
        execute: vi.fn(async () => ({
          ok: false,
          message: "spawn failed",
          stdout: "partial stdout",
          stderr: "partial stderr",
        })),
      };

      await expect(
        executeWithCliAdapter(
          createTask("task-1", "workflow-1"),
          createAgent("agent-1"),
          transport,
        ),
      ).resolves.toEqual({
        ok: false,
        reason: "TRANSPORT_ERROR",
        message: "spawn failed",
        rawStdout: "partial stdout",
        rawStderr: "partial stderr",
      });
    });

    it("returns EXECUTION_FAILED for non-zero exit codes", async () => {
      const transport: CliTransportPort = {
        execute: vi.fn(async () => ({
          ok: true,
          stdout: "partial stdout",
          stderr: "boom",
          exitCode: 9,
        })),
      };

      const result = await executeWithCliAdapter(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        transport,
      );

      expect(result).toEqual({
        ok: false,
        reason: "EXECUTION_FAILED",
        message: "CLI execution exited with code 9",
        rawStdout: "partial stdout",
        rawStderr: "boom",
      });
    });

    it("returns TRANSPORT_ERROR instead of throwing raw transport exceptions", async () => {
      const transport: CliTransportPort = {
        execute: vi.fn(async () => {
          throw new Error("transport exploded");
        }),
      };

      await expect(
        executeWithCliAdapter(
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
  });
});
