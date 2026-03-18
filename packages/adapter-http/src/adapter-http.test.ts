import { describe, expect, it, vi } from "vitest";
import type { AgentDefinition, Task } from "@regisseur/core";

import { executeWithHttpAdapter } from "./adapter.js";
import { parseHttpConfig } from "./config.js";
import { createHttpExecutionRequest } from "./request-mapper.js";
import { mapHttpTransportResultToExecutionResult } from "./response-mapper.js";
import type { HttpTransportPort } from "./ports.js";

function createAgent(
  agentId: string,
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    agentId,
    name: `${agentId}-name`,
    runtimeType: "http",
    capabilities: [],
    enabled: true,
    config: {
      url: "https://example.com/execute",
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

describe("adapter-http", () => {
  describe("parseHttpConfig", () => {
    it("throws when runtimeType is not http", () => {
      expect(() =>
        parseHttpConfig(
          createAgent("agent-1", {
            runtimeType: "cli",
          }),
        ),
      ).toThrow("does not use the http runtime");
    });

    it("throws when url is missing", () => {
      expect(() =>
        parseHttpConfig(
          createAgent("agent-1", {
            config: {},
          }),
        ),
      ).toThrow("url must be a non-empty string");
    });

    it("defaults method to POST", () => {
      expect(parseHttpConfig(createAgent("agent-1")).method).toBe("POST");
    });

    it("throws when method is not POST", () => {
      expect(() =>
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              method: "GET",
            },
          }),
        ),
      ).toThrow("method must be POST");
    });

    it("parses headers when they are a string map", () => {
      expect(
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              headers: {
                "X-Test": "1",
              },
            },
          }),
        ).headers,
      ).toEqual({
        "X-Test": "1",
      });
    });

    it("throws when headers contain non-string values", () => {
      expect(() =>
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              headers: {
                "X-Test": 1,
              },
            },
          }),
        ),
      ).toThrow("headers must contain only string values");
    });

    it("throws when timeoutMs is not a number", () => {
      expect(() =>
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              timeoutMs: "1000",
            },
          }),
        ),
      ).toThrow("timeoutMs must be a number");
    });

    it("parses optional fields when they are omitted", () => {
      expect(parseHttpConfig(createAgent("agent-1"))).toEqual({
        url: "https://example.com/execute",
        method: "POST",
        headers: {},
        timeoutMs: undefined,
        authToken: undefined,
        includeAgentName: false,
      });
    });

    it("defaults includeAgentName to false", () => {
      expect(parseHttpConfig(createAgent("agent-1")).includeAgentName).toBe(
        false,
      );
    });

    it("parses authToken when it is a string", () => {
      expect(
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              authToken: "secret-token",
            },
          }),
        ).authToken,
      ).toBe("secret-token");
    });

    it("throws when authToken is not a string", () => {
      expect(() =>
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              authToken: 42,
            },
          }),
        ),
      ).toThrow("authToken must be a non-empty string");
    });
  });

  describe("createHttpExecutionRequest", () => {
    it("creates an execution request from task, agent, and parsed config", () => {
      const task = createTask("task-1", "workflow-1");
      const agent = createAgent("agent-1");
      const config = parseHttpConfig(
        createAgent("agent-1", {
          config: {
            url: "https://example.com",
            headers: {
              "X-Test": "1",
            },
            timeoutMs: 1500,
          },
        }),
      );

      expect(createHttpExecutionRequest(task, agent, config)).toEqual({
        url: "https://example.com",
        method: "POST",
        headers: {
          "X-Test": "1",
        },
        timeoutMs: 1500,
        body: {
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

    it("includes agentName when includeAgentName is true", () => {
      const request = createHttpExecutionRequest(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              includeAgentName: true,
            },
          }),
        ),
      );

      expect(request.body.agentName).toBe("agent-1-name");
    });

    it("omits agentName when includeAgentName is false", () => {
      const request = createHttpExecutionRequest(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        parseHttpConfig(createAgent("agent-1")),
      );

      expect("agentName" in request.body).toBe(false);
    });

    it("preserves nested payload structures in the request body", () => {
      const request = createHttpExecutionRequest(
        createTask("task-1", "workflow-1", {
          payload: {
            nested: {
              values: ["a", "b"],
            },
          },
        }),
        createAgent("agent-1"),
        parseHttpConfig(createAgent("agent-1")),
      );

      expect(request.body.payload).toEqual({
        nested: {
          values: ["a", "b"],
        },
      });
    });

    it("adds Authorization header from authToken", () => {
      const request = createHttpExecutionRequest(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              authToken: "secret",
            },
          }),
        ),
      );

      expect(request.headers.Authorization).toBe("Bearer secret");
    });

    it("overwrites an existing Authorization header when authToken is present", () => {
      const request = createHttpExecutionRequest(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              headers: {
                Authorization: "Basic old",
              },
              authToken: "new-token",
            },
          }),
        ),
      );

      expect(request.headers.Authorization).toBe("Bearer new-token");
    });

    it("keeps an existing Authorization header when authToken is absent", () => {
      const request = createHttpExecutionRequest(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        parseHttpConfig(
          createAgent("agent-1", {
            config: {
              url: "https://example.com",
              headers: {
                Authorization: "Basic keep-me",
              },
            },
          }),
        ),
      );

      expect(request.headers.Authorization).toBe("Basic keep-me");
    });
  });

  describe("mapHttpTransportResultToExecutionResult", () => {
    it("maps transport failures to TRANSPORT_ERROR", () => {
      expect(
        mapHttpTransportResultToExecutionResult({
          ok: false,
          message: "request failed",
          bodyText: "partial body",
        }),
      ).toEqual({
        ok: false,
        reason: "TRANSPORT_ERROR",
        message: "request failed",
        rawBodyText: "partial body",
      });
    });

    it("maps 2xx JSON responses to success with parsed output", () => {
      expect(
        mapHttpTransportResultToExecutionResult({
          ok: true,
          status: 200,
          bodyText: '{"result":"ok"}',
          headers: {
            "x-ignored": "true",
          },
        }),
      ).toEqual({
        ok: true,
        externalRunId: undefined,
        output: {
          result: "ok",
        },
        rawBodyText: '{"result":"ok"}',
      });
    });

    it("keeps success when a 2xx body is not JSON", () => {
      expect(
        mapHttpTransportResultToExecutionResult({
          ok: true,
          status: 200,
          bodyText: "plain text body",
        }),
      ).toEqual({
        ok: true,
        externalRunId: undefined,
        output: undefined,
        rawBodyText: "plain text body",
      });
    });

    it("maps non-2xx responses to EXECUTION_FAILED", () => {
      expect(
        mapHttpTransportResultToExecutionResult({
          ok: true,
          status: 500,
          bodyText: '{"error":"boom"}',
        }),
      ).toEqual({
        ok: false,
        reason: "EXECUTION_FAILED",
        message: "HTTP execution failed with status 500",
        rawBodyText: '{"error":"boom"}',
      });
    });

    it("uses runId as a fallback externalRunId", () => {
      const result = mapHttpTransportResultToExecutionResult({
        ok: true,
        status: 200,
        bodyText: '{"runId":"run-1"}',
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.externalRunId).toBe("run-1");
      }
    });

    it("uses externalRunId when present", () => {
      const result = mapHttpTransportResultToExecutionResult({
        ok: true,
        status: 200,
        bodyText: '{"externalRunId":"external-1"}',
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.externalRunId).toBe("external-1");
      }
    });

    it("keeps externalRunId undefined when the body has no execution id", () => {
      const result = mapHttpTransportResultToExecutionResult({
        ok: true,
        status: 200,
        bodyText: '{"result":"ok"}',
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.externalRunId).toBeUndefined();
      }
    });

    it("does not expose transport response headers in the execution result", () => {
      const result = mapHttpTransportResultToExecutionResult({
        ok: true,
        status: 200,
        bodyText: '{"result":"ok"}',
        headers: {
          "x-response-id": "123",
        },
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect("headers" in result).toBe(false);
      }
    });

    it("prefers externalRunId over runId when both are present", () => {
      const result = mapHttpTransportResultToExecutionResult({
        ok: true,
        status: 200,
        bodyText: '{"externalRunId":"external-1","runId":"run-1"}',
      });

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.externalRunId).toBe("external-1");
      }
    });
  });

  describe("executeWithHttpAdapter", () => {
    it("returns success for a valid agent, task, and transport result", async () => {
      const transport: HttpTransportPort = {
        execute: vi.fn(async () => ({
          ok: true,
          status: 200,
          bodyText: '{"result":"ok","runId":"run-1"}',
        })),
      };

      const result = await executeWithHttpAdapter(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1", {
          config: {
            url: "https://example.com",
            headers: {
              "X-Test": "1",
            },
            timeoutMs: 5000,
            authToken: "token-1",
            includeAgentName: true,
          },
        }),
        transport,
      );

      expect(result).toEqual({
        ok: true,
        externalRunId: "run-1",
        output: {
          result: "ok",
          runId: "run-1",
        },
        rawBodyText: '{"result":"ok","runId":"run-1"}',
      });
      expect(transport.execute).toHaveBeenCalledTimes(1);
      expect(transport.execute).toHaveBeenCalledWith({
        url: "https://example.com",
        method: "POST",
        headers: {
          "X-Test": "1",
          Authorization: "Bearer token-1",
        },
        timeoutMs: 5000,
        body: {
          taskId: "task-1",
          workflowId: "workflow-1",
          title: "task-1",
          payload: {
            nested: {
              value: true,
            },
          },
          agentId: "agent-1",
          agentName: "agent-1-name",
        },
      });
    });

    it("returns INVALID_AGENT_RUNTIME for non-http agents", async () => {
      const transport: HttpTransportPort = {
        execute: vi.fn(),
      };

      const result = await executeWithHttpAdapter(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1", {
          runtimeType: "cli",
        }),
        transport,
      );

      expect(result).toEqual({
        ok: false,
        reason: "INVALID_AGENT_RUNTIME",
        message: "Agent agent-1 does not use the http runtime",
      });
      expect(transport.execute).not.toHaveBeenCalled();
    });

    it("returns INVALID_AGENT_CONFIG for invalid config", async () => {
      const transport: HttpTransportPort = {
        execute: vi.fn(),
      };

      const result = await executeWithHttpAdapter(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1", {
          config: {
            url: 42,
          },
        }),
        transport,
      );

      expect(result).toEqual({
        ok: false,
        reason: "INVALID_AGENT_CONFIG",
        message: "HTTP config field url must be a non-empty string",
      });
      expect(transport.execute).not.toHaveBeenCalled();
    });

    it("returns TRANSPORT_ERROR when the transport reports failure", async () => {
      const transport: HttpTransportPort = {
        execute: vi.fn(async () => ({
          ok: false,
          message: "request failed",
          bodyText: "partial body",
        })),
      };

      await expect(
        executeWithHttpAdapter(
          createTask("task-1", "workflow-1"),
          createAgent("agent-1"),
          transport,
        ),
      ).resolves.toEqual({
        ok: false,
        reason: "TRANSPORT_ERROR",
        message: "request failed",
        rawBodyText: "partial body",
      });
    });

    it("returns EXECUTION_FAILED for non-2xx responses", async () => {
      const transport: HttpTransportPort = {
        execute: vi.fn(async () => ({
          ok: true,
          status: 404,
          bodyText: '{"error":"missing"}',
        })),
      };

      const result = await executeWithHttpAdapter(
        createTask("task-1", "workflow-1"),
        createAgent("agent-1"),
        transport,
      );

      expect(result).toEqual({
        ok: false,
        reason: "EXECUTION_FAILED",
        message: "HTTP execution failed with status 404",
        rawBodyText: '{"error":"missing"}',
      });
    });

    it("returns TRANSPORT_ERROR instead of throwing raw transport exceptions", async () => {
      const transport: HttpTransportPort = {
        execute: vi.fn(async () => {
          throw new Error("socket exploded");
        }),
      };

      await expect(
        executeWithHttpAdapter(
          createTask("task-1", "workflow-1"),
          createAgent("agent-1"),
          transport,
        ),
      ).resolves.toEqual({
        ok: false,
        reason: "TRANSPORT_ERROR",
        message: "socket exploded",
      });
    });
  });
});
