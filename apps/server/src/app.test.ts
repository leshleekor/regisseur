import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  Run,
  Schedule,
  Task,
  TaskEdge,
  Workflow,
} from "@regisseur/core";
import type { DispatchTaskResult } from "@regisseur/dispatcher";

import { buildApp } from "./app.js";
import { createDispatcherLike } from "./plugins/dispatcher.js";
import { createServerDependencies } from "./plugins/repositories.js";
import type {
  AgentsRepositoryLike,
  DispatcherLike,
  RunsRepositoryLike,
  SchedulesRepositoryLike,
  ServerDependencies,
  TaskEdgesRepositoryLike,
  TasksRepositoryLike,
  WorkflowsRepositoryLike,
} from "./types.js";

function createAgent(
  agentId: string,
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    agentId,
    name: agentId,
    runtimeType: "cli",
    capabilities: [],
    enabled: true,
    config: {},
    ...overrides,
  };
}

function createWorkflow(
  workflowId: string,
  overrides: Partial<Workflow> = {},
): Workflow {
  return {
    workflowId,
    name: workflowId,
    status: "pending",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
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
    payload: {},
    status: "ready",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createSchedule(
  scheduleId: string,
  overrides: Partial<Schedule> = {},
): Schedule {
  return {
    scheduleId,
    type: "once",
    runAt: "2026-03-15T01:00:00.000Z",
    enabled: true,
    targetType: "workflow",
    targetId: "workflow-1",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createRun(
  runId: string,
  taskId: string,
  agentId: string,
  overrides: Partial<Run> = {},
): Run {
  return {
    runId,
    taskId,
    agentId,
    status: "queued",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
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

function responseJson<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

interface TestContext {
  deps: ServerDependencies;
  state: {
    agents: Map<string, AgentDefinition>;
    workflows: Map<string, Workflow>;
    tasks: Map<string, Task>;
    taskEdges: TaskEdge[];
    schedules: Map<string, Schedule>;
    runs: Map<string, Run>;
  };
  callLog: string[];
  spies: {
    agents: Record<string, ReturnType<typeof vi.fn>>;
    workflows: Record<string, ReturnType<typeof vi.fn>>;
    tasks: Record<string, ReturnType<typeof vi.fn>>;
    taskEdges: Record<string, ReturnType<typeof vi.fn>>;
    schedules: Record<string, ReturnType<typeof vi.fn>>;
    runs: Record<string, ReturnType<typeof vi.fn>>;
    dispatcher: ReturnType<typeof vi.fn>;
  };
}

function createTestContext(): TestContext {
  const state = {
    agents: new Map<string, AgentDefinition>(),
    workflows: new Map<string, Workflow>(),
    tasks: new Map<string, Task>(),
    taskEdges: [],
    schedules: new Map<string, Schedule>(),
    runs: new Map<string, Run>(),
  };
  const callLog: string[] = [];

  const agentsUpsert = vi.fn(async (agent: AgentDefinition) => {
    callLog.push("agents.upsert");
    state.agents.set(agent.agentId, agent);
  });
  const agentsFindAll = vi.fn(async () => {
    callLog.push("agents.findAll");
    return Array.from(state.agents.values());
  });
  const agentsFindEnabled = vi.fn(async () => {
    callLog.push("agents.findEnabled");
    return Array.from(state.agents.values()).filter((agent) => agent.enabled);
  });
  const agentsFindById = vi.fn(async (agentId: string) => {
    callLog.push("agents.findById");
    return state.agents.get(agentId) ?? null;
  });
  const agentsDeleteById = vi.fn(async (agentId: string) => {
    callLog.push("agents.deleteById");
    state.agents.delete(agentId);
  });

  const workflowsUpsert = vi.fn(async (workflow: Workflow) => {
    callLog.push("workflows.upsert");
    state.workflows.set(workflow.workflowId, workflow);
  });
  const workflowsFindAll = vi.fn(async () => {
    callLog.push("workflows.findAll");
    return Array.from(state.workflows.values());
  });
  const workflowsFindByStatus = vi.fn(async (status: Workflow["status"]) => {
    callLog.push("workflows.findByStatus");
    return Array.from(state.workflows.values()).filter(
      (workflow) => workflow.status === status,
    );
  });
  const workflowsFindById = vi.fn(async (workflowId: string) => {
    callLog.push("workflows.findById");
    return state.workflows.get(workflowId) ?? null;
  });
  const workflowsDeleteById = vi.fn(async (workflowId: string) => {
    callLog.push("workflows.deleteById");
    state.workflows.delete(workflowId);
  });

  const tasksUpsert = vi.fn(async (task: Task) => {
    callLog.push("tasks.upsert");
    state.tasks.set(task.taskId, task);
  });
  const tasksFindByWorkflowId = vi.fn(async (workflowId: string) => {
    callLog.push("tasks.findByWorkflowId");
    return Array.from(state.tasks.values()).filter(
      (task) => task.workflowId === workflowId,
    );
  });
  const tasksFindByStatus = vi.fn(async (status: Task["status"]) => {
    callLog.push("tasks.findByStatus");
    return Array.from(state.tasks.values()).filter(
      (task) => task.status === status,
    );
  });
  const tasksFindById = vi.fn(async (taskId: string) => {
    callLog.push("tasks.findById");
    return state.tasks.get(taskId) ?? null;
  });
  const tasksDeleteById = vi.fn(async (taskId: string) => {
    callLog.push("tasks.deleteById");
    state.tasks.delete(taskId);
  });

  const schedulesUpsert = vi.fn(async (schedule: Schedule) => {
    callLog.push("schedules.upsert");
    state.schedules.set(schedule.scheduleId, schedule);
  });
  const taskEdgesInsert = vi.fn(async (edge: TaskEdge) => {
    callLog.push("taskEdges.insert");
    state.taskEdges.push(edge);
  });
  const taskEdgesInsertMany = vi.fn(async (edges: readonly TaskEdge[]) => {
    callLog.push("taskEdges.insertMany");
    state.taskEdges.push(...edges);
  });
  const taskEdgesFindAllByWorkflowTasks = vi.fn(
    async (taskIds: readonly string[]) => {
      callLog.push("taskEdges.findAllByWorkflowTasks");
      const taskIdSet = new Set(taskIds);

      return state.taskEdges.filter(
        (edge) =>
          taskIdSet.has(edge.fromTaskId) && taskIdSet.has(edge.toTaskId),
      );
    },
  );
  const taskEdgesFindByFromTaskId = vi.fn(async (taskId: string) => {
    callLog.push("taskEdges.findByFromTaskId");
    return state.taskEdges.filter((edge) => edge.fromTaskId === taskId);
  });
  const taskEdgesFindByToTaskId = vi.fn(async (taskId: string) => {
    callLog.push("taskEdges.findByToTaskId");
    return state.taskEdges.filter((edge) => edge.toTaskId === taskId);
  });
  const taskEdgesDeleteByTaskId = vi.fn(async (taskId: string) => {
    callLog.push("taskEdges.deleteByTaskId");
    state.taskEdges = state.taskEdges.filter(
      (edge) => edge.fromTaskId !== taskId && edge.toTaskId !== taskId,
    );
  });
  const schedulesFindAll = vi.fn(async () => {
    callLog.push("schedules.findAll");
    return Array.from(state.schedules.values());
  });
  const schedulesFindEnabled = vi.fn(async () => {
    callLog.push("schedules.findEnabled");
    return Array.from(state.schedules.values()).filter(
      (schedule) => schedule.enabled,
    );
  });
  const schedulesFindByTarget = vi.fn(
    async (targetType: Schedule["targetType"], targetId: string) => {
      callLog.push("schedules.findByTarget");
      return Array.from(state.schedules.values()).filter(
        (schedule) =>
          schedule.targetType === targetType && schedule.targetId === targetId,
      );
    },
  );
  const schedulesFindById = vi.fn(async (scheduleId: string) => {
    callLog.push("schedules.findById");
    return state.schedules.get(scheduleId) ?? null;
  });
  const schedulesDeleteById = vi.fn(async (scheduleId: string) => {
    callLog.push("schedules.deleteById");
    state.schedules.delete(scheduleId);
  });

  const runsUpsert = vi.fn(async (run: Run) => {
    callLog.push("runs.upsert");
    state.runs.set(run.runId, run);
  });
  const runsFindByTaskId = vi.fn(async (taskId: string) => {
    callLog.push("runs.findByTaskId");
    return Array.from(state.runs.values()).filter(
      (run) => run.taskId === taskId,
    );
  });
  const runsFindByAgentId = vi.fn(async (agentId: string) => {
    callLog.push("runs.findByAgentId");
    return Array.from(state.runs.values()).filter(
      (run) => run.agentId === agentId,
    );
  });
  const runsFindByStatus = vi.fn(async (status: Run["status"]) => {
    callLog.push("runs.findByStatus");
    return Array.from(state.runs.values()).filter(
      (run) => run.status === status,
    );
  });
  const runsFindById = vi.fn(async (runId: string) => {
    callLog.push("runs.findById");
    return state.runs.get(runId) ?? null;
  });
  const runsDeleteById = vi.fn(async (runId: string) => {
    callLog.push("runs.deleteById");
    state.runs.delete(runId);
  });

  const dispatcherDispatch = vi.fn(
    async (
      task: Task,
      agents: readonly AgentDefinition[],
      options?: { triggerSource?: "manual" | "schedule" | "internal" },
    ): Promise<DispatchTaskResult> => {
      callLog.push("dispatcher.dispatch");

      return {
        ok: true,
        taskId: task.taskId,
        workflowId: task.workflowId,
        agentId: task.assigneeAgentId ?? agents[0]?.agentId ?? "agent-1",
        enqueueResult: {
          ok: true,
          jobId: options?.triggerSource
            ? `job-${options.triggerSource}`
            : `job-${task.taskId}`,
        },
      };
    },
  );

  const agentsRepository: AgentsRepositoryLike = {
    upsert: agentsUpsert,
    findAll: agentsFindAll,
    findEnabled: agentsFindEnabled,
    findById: agentsFindById,
    deleteById: agentsDeleteById,
  };
  const workflowsRepository: WorkflowsRepositoryLike = {
    upsert: workflowsUpsert,
    findAll: workflowsFindAll,
    findByStatus: workflowsFindByStatus,
    findById: workflowsFindById,
    deleteById: workflowsDeleteById,
  };
  const tasksRepository: TasksRepositoryLike = {
    upsert: tasksUpsert,
    findByWorkflowId: tasksFindByWorkflowId,
    findByStatus: tasksFindByStatus,
    findById: tasksFindById,
    deleteById: tasksDeleteById,
  };
  const schedulesRepository: SchedulesRepositoryLike = {
    upsert: schedulesUpsert,
    findAll: schedulesFindAll,
    findEnabled: schedulesFindEnabled,
    findByTarget: schedulesFindByTarget,
    findById: schedulesFindById,
    deleteById: schedulesDeleteById,
  };
  const taskEdgesRepository: TaskEdgesRepositoryLike = {
    insert: taskEdgesInsert,
    insertMany: taskEdgesInsertMany,
    findAllByWorkflowTasks: taskEdgesFindAllByWorkflowTasks,
    findByFromTaskId: taskEdgesFindByFromTaskId,
    findByToTaskId: taskEdgesFindByToTaskId,
    deleteByTaskId: taskEdgesDeleteByTaskId,
  };
  const runsRepository: RunsRepositoryLike = {
    upsert: runsUpsert,
    findByTaskId: runsFindByTaskId,
    findByAgentId: runsFindByAgentId,
    findByStatus: runsFindByStatus,
    findById: runsFindById,
    deleteById: runsDeleteById,
  };
  const dispatcher: DispatcherLike = {
    dispatch: dispatcherDispatch,
  };

  return {
    deps: createServerDependencies(
      {
        agentsRepository,
        workflowsRepository,
        tasksRepository,
        taskEdgesRepository,
        schedulesRepository,
        runsRepository,
      },
      dispatcher,
      false,
    ),
    state,
    callLog,
    spies: {
      agents: {
        upsert: agentsUpsert,
        findAll: agentsFindAll,
        findEnabled: agentsFindEnabled,
        findById: agentsFindById,
        deleteById: agentsDeleteById,
      },
      workflows: {
        upsert: workflowsUpsert,
        findAll: workflowsFindAll,
        findByStatus: workflowsFindByStatus,
        findById: workflowsFindById,
        deleteById: workflowsDeleteById,
      },
      tasks: {
        upsert: tasksUpsert,
        findByWorkflowId: tasksFindByWorkflowId,
        findByStatus: tasksFindByStatus,
        findById: tasksFindById,
        deleteById: tasksDeleteById,
      },
      taskEdges: {
        insert: taskEdgesInsert,
        insertMany: taskEdgesInsertMany,
        findAllByWorkflowTasks: taskEdgesFindAllByWorkflowTasks,
        findByFromTaskId: taskEdgesFindByFromTaskId,
        findByToTaskId: taskEdgesFindByToTaskId,
        deleteByTaskId: taskEdgesDeleteByTaskId,
      },
      schedules: {
        upsert: schedulesUpsert,
        findAll: schedulesFindAll,
        findEnabled: schedulesFindEnabled,
        findByTarget: schedulesFindByTarget,
        findById: schedulesFindById,
        deleteById: schedulesDeleteById,
      },
      runs: {
        upsert: runsUpsert,
        findByTaskId: runsFindByTaskId,
        findByAgentId: runsFindByAgentId,
        findByStatus: runsFindByStatus,
        findById: runsFindById,
        deleteById: runsDeleteById,
      },
      dispatcher: dispatcherDispatch,
    },
  };
}

describe("server app", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  describe("Health", () => {
    it("GET /health returns 200 with ok=true", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<{ ok: true }>(response)).toEqual({ ok: true });
    });

    it("health route does not require external dependencies to be touched", async () => {
      const ctx = createTestContext();
      ctx.deps.agentsRepository.findAll = vi.fn(async () => {
        throw new Error("should not be called");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<{ ok: true }>(response)).toEqual({ ok: true });
      expect(ctx.deps.agentsRepository.findAll).not.toHaveBeenCalled();
    });
  });

  describe("Agents API", () => {
    it("POST /agents upserts a valid agent and returns 200", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const agent = createAgent("agent-1", {
        capabilities: ["shell"],
        config: { path: "/tmp" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: agent,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<AgentDefinition>(response)).toEqual(agent);
      expect(ctx.spies.agents.upsert).toHaveBeenCalledWith(agent);
    });

    it("POST /agents returns 400 when required fields are missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          agentId: "agent-1",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("BAD_REQUEST");
    });

    it("POST /agents returns 400 for invalid runtimeType", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          ...createAgent("agent-1"),
          runtimeType: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /agents returns 400 when capabilities is not an array", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          ...createAgent("agent-1"),
          capabilities: "not-an-array",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /agents returns 400 when config is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          ...createAgent("agent-1"),
          config: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /agents returns the full list without reordering", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-2", createAgent("agent-2"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents",
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(responseJson(response))).toBe(true);
      expect(
        responseJson<AgentDefinition[]>(response).map((agent) => agent.agentId),
      ).toEqual(["agent-2", "agent-1"]);
      expect(ctx.spies.agents.findAll).toHaveBeenCalledTimes(1);
    });

    it("GET /agents?enabled=true uses the enabled filter", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.state.agents.set(
        "agent-2",
        createAgent("agent-2", { enabled: false }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents?enabled=true",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<AgentDefinition[]>(response).map((agent) => agent.agentId),
      ).toEqual(["agent-1"]);
      expect(ctx.spies.agents.findEnabled).toHaveBeenCalledTimes(1);
      expect(ctx.spies.agents.findAll).not.toHaveBeenCalled();
    });

    it("GET /agents?enabled=false returns 400", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents?enabled=false",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /agents/:agentId returns the matching agent", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents/agent-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<AgentDefinition>(response).agentId).toBe("agent-1");
    });

    it("GET /agents/:agentId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents/missing",
      });

      expect(response.statusCode).toBe(404);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("NOT_FOUND");
    });

    it("DELETE /agents/:agentId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/agents/agent-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
      expect(ctx.state.agents.has("agent-1")).toBe(false);
    });

    it("DELETE /agents/:agentId keeps the no-op 204 policy for missing ids", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/agents/missing",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });
  });

  describe("Workflows API", () => {
    it("POST /workflows succeeds with a valid workflow", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const workflow = createWorkflow("workflow-1", {
        metadata: { source: "test" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        payload: workflow,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Workflow>(response)).toEqual(workflow);
      expect(ctx.spies.workflows.upsert).toHaveBeenCalledWith(workflow);
    });

    it("POST /workflows returns 400 when a required field is missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        payload: {
          workflowId: "workflow-1",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /workflows returns 400 for invalid status", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        payload: {
          ...createWorkflow("workflow-1"),
          status: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /workflows returns 400 when metadata is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        payload: {
          ...createWorkflow("workflow-1"),
          metadata: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /workflows returns all workflows", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set("workflow-2", createWorkflow("workflow-2"));
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Workflow[]>(response).map(
          (workflow) => workflow.workflowId,
        ),
      ).toEqual(["workflow-2", "workflow-1"]);
      expect(ctx.spies.workflows.findAll).toHaveBeenCalledTimes(1);
    });

    it("GET /workflows?status=running filters by status", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set(
        "workflow-1",
        createWorkflow("workflow-1", { status: "running" }),
      );
      ctx.state.workflows.set("workflow-2", createWorkflow("workflow-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows?status=running",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Workflow[]>(response).map(
          (workflow) => workflow.workflowId,
        ),
      ).toEqual(["workflow-1"]);
      expect(ctx.spies.workflows.findByStatus).toHaveBeenCalledWith("running");
    });

    it("GET /workflows/:workflowId returns the workflow when present", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows/workflow-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Workflow>(response).workflowId).toBe("workflow-1");
    });

    it("GET /workflows/:workflowId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows/missing",
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /workflows/:workflowId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/workflows/workflow-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });

    it("DELETE /workflows/:workflowId maps pg integrity errors to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.workflowsRepository.deleteById = vi.fn(async () => {
        throw createPgError("23503");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/workflows/workflow-1",
      });

      expect(response.statusCode).toBe(409);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("CONFLICT");
    });
  });

  describe("Tasks API", () => {
    it("POST /tasks succeeds with a valid task", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const task = createTask("task-1", "workflow-1", {
        payload: { x: 1 },
        metadata: { y: 2 },
      });

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: task,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task>(response)).toEqual(task);
    });

    it("POST /tasks returns 400 when required fields are missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          taskId: "task-1",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /tasks returns 400 for invalid status", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          ...createTask("task-1", "workflow-1"),
          status: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /tasks returns 400 when payload is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          ...createTask("task-1", "workflow-1"),
          payload: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /tasks returns 400 when metadata is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          ...createTask("task-1", "workflow-1"),
          metadata: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /tasks?workflowId=... delegates to findByWorkflowId", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.tasks.set("task-2", createTask("task-2", "workflow-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks?workflowId=workflow-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task[]>(response).map((task) => task.taskId)).toEqual(
        ["task-1"],
      );
      expect(ctx.spies.tasks.findByWorkflowId).toHaveBeenCalledWith(
        "workflow-1",
      );
      expect(ctx.spies.tasks.findByStatus).not.toHaveBeenCalled();
    });

    it("GET /tasks?status=ready delegates to findByStatus", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", { status: "ready" }),
      );
      ctx.state.tasks.set(
        "task-2",
        createTask("task-2", "workflow-1", { status: "running" }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks?status=ready",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task[]>(response).map((task) => task.taskId)).toEqual(
        ["task-1"],
      );
      expect(ctx.spies.tasks.findByStatus).toHaveBeenCalledWith("ready");
      expect(ctx.spies.tasks.findByWorkflowId).not.toHaveBeenCalled();
    });

    it("GET /tasks returns 400 when no filter is provided", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /tasks returns 400 when both filters are provided", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks?workflowId=workflow-1&status=ready",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /tasks/:taskId returns the task when present", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks/task-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task>(response).taskId).toBe("task-1");
    });

    it("GET /tasks/:taskId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks/missing",
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /tasks/:taskId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/tasks/task-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });

    it("DELETE /tasks/:taskId maps pg integrity errors to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.tasksRepository.deleteById = vi.fn(async () => {
        throw createPgError("23503");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/tasks/task-1",
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe("Tasks dispatch API", () => {
    it("POST /tasks/:taskId/dispatch returns 200 on success", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", { assigneeAgentId: "agent-1" }),
      );
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson(response)).toEqual({
        ok: true,
        taskId: "task-1",
        workflowId: "workflow-1",
        agentId: "agent-1",
        enqueueResult: {
          ok: true,
          jobId: "job-manual",
        },
      });
      expect(ctx.spies.dispatcher).toHaveBeenCalledTimes(1);
      expect(ctx.spies.tasks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-1",
          status: "queued",
          assigneeAgentId: "agent-1",
          updatedAt: expect.any(String),
        }),
      );
    });

    it("POST /tasks/:taskId/dispatch defaults triggerSource to manual", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(ctx.spies.dispatcher).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        { triggerSource: "manual" },
      );
    });

    it("POST /tasks/:taskId/dispatch forwards triggerSource to dispatcher", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
        payload: {
          triggerSource: "schedule",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(ctx.spies.dispatcher).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        { triggerSource: "schedule" },
      );
      expect(ctx.spies.tasks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "queued",
        }),
      );
    });

    it("POST /tasks/:taskId/dispatch returns 404 when the task is missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/missing/dispatch",
      });

      expect(response.statusCode).toBe(404);
      expect(ctx.spies.dispatcher).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps TASK_NOT_READY to 409", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", { status: "pending" }),
      );
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.dispatcher.dispatch = vi.fn(async () => ({
        ok: false,
        taskId: "task-1",
        workflowId: "workflow-1",
        reason: "TASK_NOT_READY",
        message: "Task is not ready",
      }));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("TASK_NOT_READY");
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps ASSIGNEE_NOT_FOUND to 409", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.dispatcher.dispatch = vi.fn(async () => ({
        ok: false,
        taskId: "task-1",
        workflowId: "workflow-1",
        reason: "ASSIGNEE_NOT_FOUND",
        message: "Missing assignee",
      }));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("ASSIGNEE_NOT_FOUND");
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps ASSIGNEE_DISABLED to 409", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.dispatcher.dispatch = vi.fn(async () => ({
        ok: false,
        taskId: "task-1",
        workflowId: "workflow-1",
        reason: "ASSIGNEE_DISABLED",
        message: "Assignee disabled",
      }));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps NO_MATCHING_AGENT to 409", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.dispatcher.dispatch = vi.fn(async () => ({
        ok: false,
        taskId: "task-1",
        workflowId: "workflow-1",
        reason: "NO_MATCHING_AGENT",
        message: "No matching agent",
      }));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps ENQUEUE_FAILED to 502", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.dispatcher.dispatch = vi.fn(async () => ({
        ok: false,
        taskId: "task-1",
        workflowId: "workflow-1",
        reason: "ENQUEUE_FAILED",
        message: "queue down",
      }));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(502);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("ENQUEUE_FAILED");
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch returns 500 when queued state persistence fails", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.tasksRepository.upsert = vi.fn(async () => {
        throw new Error("persist failed");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(500);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("INTERNAL_SERVER_ERROR");
    });

    it("POST /tasks/:taskId/dispatch validates triggerSource", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
        payload: {
          triggerSource: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(ctx.spies.dispatcher).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch fetches task then agents before dispatch", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(ctx.callLog).toEqual([
        "tasks.findById",
        "agents.findAll",
        "dispatcher.dispatch",
        "tasks.upsert",
      ]);
    });
  });

  describe("Schedules API", () => {
    it("POST /schedules accepts a once schedule", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const schedule = createSchedule("schedule-1");

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: schedule,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Schedule>(response)).toEqual(schedule);
    });

    it("POST /schedules accepts a cron schedule", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const schedule = createSchedule("schedule-1", {
        type: "cron",
        runAt: undefined,
        cronExpression: "0 * * * *",
        timezone: "Asia/Seoul",
        targetType: "task",
        targetId: "task-1",
      });

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: schedule,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Schedule>(response)).toEqual(schedule);
    });

    it("POST /schedules rejects invalid once combinations", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: {
          ...createSchedule("schedule-1"),
          runAt: undefined,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /schedules rejects invalid cron combinations", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: {
          ...createSchedule("schedule-1", {
            type: "cron",
            runAt: undefined,
          }),
          cronExpression: undefined,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /schedules returns all schedules when no filter is supplied", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set("schedule-2", createSchedule("schedule-2"));
      ctx.state.schedules.set("schedule-1", createSchedule("schedule-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Schedule[]>(response).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-2", "schedule-1"]);
      expect(ctx.spies.schedules.findAll).toHaveBeenCalledTimes(1);
    });

    it("GET /schedules?enabled=true uses the enabled filter", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set("schedule-1", createSchedule("schedule-1"));
      ctx.state.schedules.set(
        "schedule-2",
        createSchedule("schedule-2", { enabled: false }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?enabled=true",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Schedule[]>(response).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-1"]);
      expect(ctx.spies.schedules.findEnabled).toHaveBeenCalledTimes(1);
    });

    it("GET /schedules?enabled=false returns 400", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?enabled=false",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /schedules?targetType=task&targetId=t1 filters by target", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set(
        "schedule-1",
        createSchedule("schedule-1", {
          targetType: "task",
          targetId: "task-1",
        }),
      );
      ctx.state.schedules.set("schedule-2", createSchedule("schedule-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?targetType=task&targetId=task-1",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Schedule[]>(response).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-1"]);
      expect(ctx.spies.schedules.findByTarget).toHaveBeenCalledWith(
        "task",
        "task-1",
      );
    });

    it("GET /schedules?targetType=task returns 400", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?targetType=task",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /schedules?targetId=t1 returns 400", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?targetId=task-1",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /schedules/:scheduleId returns the schedule when present", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set("schedule-1", createSchedule("schedule-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules/schedule-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Schedule>(response).scheduleId).toBe("schedule-1");
    });

    it("GET /schedules/:scheduleId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules/missing",
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /schedules/:scheduleId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set("schedule-1", createSchedule("schedule-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/schedules/schedule-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });

    it("POST /schedules only performs persistence work", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      await app.inject({
        method: "POST",
        url: "/schedules",
        payload: createSchedule("schedule-1"),
      });

      expect(ctx.spies.schedules.upsert).toHaveBeenCalledTimes(1);
      expect(ctx.spies.dispatcher).not.toHaveBeenCalled();
    });
  });

  describe("Runs API", () => {
    it("POST /runs succeeds with a valid run", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const run = createRun("run-1", "task-1", "agent-1", {
        output: { result: "ok" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/runs",
        payload: run,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run>(response)).toEqual(run);
    });

    it("POST /runs returns 400 for invalid status", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/runs",
        payload: {
          ...createRun("run-1", "task-1", "agent-1"),
          status: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /runs returns 400 when output is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/runs",
        payload: {
          ...createRun("run-1", "task-1", "agent-1"),
          output: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /runs?taskId=t1 delegates to findByTaskId", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set("run-1", createRun("run-1", "task-1", "agent-1"));
      ctx.state.runs.set("run-2", createRun("run-2", "task-2", "agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs?taskId=task-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run[]>(response).map((run) => run.runId)).toEqual([
        "run-1",
      ]);
      expect(ctx.spies.runs.findByTaskId).toHaveBeenCalledWith("task-1");
    });

    it("GET /runs?agentId=a1 delegates to findByAgentId", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set("run-1", createRun("run-1", "task-1", "agent-1"));
      ctx.state.runs.set("run-2", createRun("run-2", "task-1", "agent-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs?agentId=agent-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run[]>(response).map((run) => run.runId)).toEqual([
        "run-1",
      ]);
      expect(ctx.spies.runs.findByAgentId).toHaveBeenCalledWith("agent-1");
    });

    it("GET /runs?status=running delegates to findByStatus", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set(
        "run-1",
        createRun("run-1", "task-1", "agent-1", { status: "running" }),
      );
      ctx.state.runs.set("run-2", createRun("run-2", "task-1", "agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs?status=running",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run[]>(response).map((run) => run.runId)).toEqual([
        "run-1",
      ]);
      expect(ctx.spies.runs.findByStatus).toHaveBeenCalledWith("running");
    });

    it("GET /runs returns 400 when no filter is provided", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /runs returns 400 when multiple filters are provided", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs?taskId=task-1&status=running",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /runs/:runId returns the run when present", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set("run-1", createRun("run-1", "task-1", "agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs/run-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run>(response).runId).toBe("run-1");
    });

    it("GET /runs/:runId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs/missing",
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /runs/:runId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set("run-1", createRun("run-1", "task-1", "agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/runs/run-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });
  });

  describe("Error handling", () => {
    it("validation failures return the unified 400 error shape", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(responseJson(response)).toEqual({
        error: {
          code: "BAD_REQUEST",
          message: expect.any(String),
        },
      });
    });

    it("not found errors return the unified 404 error shape", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents/missing",
      });

      expect(response.statusCode).toBe(404);
      expect(responseJson(response)).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Agent missing not found",
        },
      });
    });

    it("pg code 23503 maps to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.agentsRepository.deleteById = vi.fn(async () => {
        throw createPgError("23503");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/agents/agent-1",
      });

      expect(response.statusCode).toBe(409);
    });

    it("pg code 23505 maps to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.agentsRepository.upsert = vi.fn(async () => {
        throw createPgError("23505");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: createAgent("agent-1"),
      });

      expect(response.statusCode).toBe(409);
    });

    it("pg code 23514 maps to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.schedulesRepository.upsert = vi.fn(async () => {
        throw createPgError("23514");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: createSchedule("schedule-1"),
      });

      expect(response.statusCode).toBe(409);
    });

    it("unexpected errors map to 500", async () => {
      const ctx = createTestContext();
      ctx.deps.workflowsRepository.findAll = vi.fn(async () => {
        throw new Error("boom");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows",
      });

      expect(response.statusCode).toBe(500);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("INTERNAL_SERVER_ERROR");
    });

    it("unexpected errors do not expose a raw stack trace", async () => {
      const ctx = createTestContext();
      ctx.deps.workflowsRepository.findAll = vi.fn(async () => {
        const error = new Error("boom");
        error.stack = "sensitive stack";
        throw error;
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows",
      });

      expect(response.statusCode).toBe(500);
      expect(response.body.includes("sensitive stack")).toBe(false);
    });

    it("dispatcher failures use the dispatcher reason as the HTTP error code", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.dispatcher.dispatch = vi.fn(async () => ({
        ok: false,
        taskId: "task-1",
        workflowId: "workflow-1",
        reason: "TASK_NOT_READY",
        message: "Task is not ready for dispatch",
      }));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(responseJson(response)).toEqual({
        error: {
          code: "TASK_NOT_READY",
          message: "Task is not ready for dispatch",
        },
      });
    });
  });

  describe("Dependency injection and composition", () => {
    it("buildApp creates a Fastify instance from injected dependencies", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
    });

    it("fake repositories and a fake dispatcher can fully drive the app", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      app = buildApp(ctx.deps);

      const agentsResponse = await app.inject({
        method: "GET",
        url: "/agents",
      });
      const dispatchResponse = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(agentsResponse.statusCode).toBe(200);
      expect(dispatchResponse.statusCode).toBe(200);
    });

    it("route handlers use the injected repository instances", async () => {
      const ctx = createTestContext();
      ctx.deps.agentsRepository.findAll = vi.fn(async () => [
        createAgent("agent-injected"),
      ]);
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<AgentDefinition[]>(response).map((agent) => agent.agentId),
      ).toEqual(["agent-injected"]);
    });

    it("buildApp throws when a required dependency is missing", () => {
      expect(() =>
        buildApp({
          workflowsRepository: {} as WorkflowsRepositoryLike,
          tasksRepository: {} as TasksRepositoryLike,
          taskEdgesRepository: {} as TaskEdgesRepositoryLike,
          schedulesRepository: {} as SchedulesRepositoryLike,
          runsRepository: {} as RunsRepositoryLike,
          dispatcher: {} as DispatcherLike,
        }),
      ).toThrow("Missing dependency: agentsRepository");
    });

    it("createDispatcherLike binds enqueuePort into a DispatcherLike facade", async () => {
      const enqueuePort = {
        enqueueTaskDispatch: vi.fn(async () => ({
          ok: true as const,
          jobId: "job-1",
        })),
      };
      const dispatcher = createDispatcherLike(enqueuePort);

      const result = await dispatcher.dispatch(
        createTask("task-1", "workflow-1"),
        [createAgent("agent-1")],
        {
          triggerSource: "manual",
        },
      );

      expect(result).toEqual({
        ok: true,
        taskId: "task-1",
        workflowId: "workflow-1",
        agentId: "agent-1",
        enqueueResult: {
          ok: true,
          jobId: "job-1",
        },
      });
      expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledTimes(1);
    });
  });
});
