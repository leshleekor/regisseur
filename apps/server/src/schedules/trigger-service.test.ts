import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  Schedule,
  Task,
  TaskEdge,
  Workflow,
} from "@regisseur/core";

import { handleScheduleTrigger } from "./trigger-service.js";

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
    status: "pending",
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
    targetType: "task",
    targetId: "task-1",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createEdge(fromTaskId: string, toTaskId: string): TaskEdge {
  return {
    fromTaskId,
    toTaskId,
    type: "depends_on",
  };
}

function createRepositories(options: {
  schedules?: readonly Schedule[];
  tasks?: readonly Task[];
  workflows?: readonly Workflow[];
  agents?: readonly AgentDefinition[];
  edges?: readonly TaskEdge[];
  failScheduleDisable?: boolean;
}) {
  const schedules = new Map(
    (options.schedules ?? []).map((schedule) => [
      schedule.scheduleId,
      schedule,
    ]),
  );
  const tasks = new Map(
    (options.tasks ?? []).map((task) => [task.taskId, task]),
  );
  const workflows = new Map(
    (options.workflows ?? []).map((workflow) => [
      workflow.workflowId,
      workflow,
    ]),
  );
  const agents = new Map(
    (options.agents ?? []).map((agent) => [agent.agentId, agent]),
  );
  const edges = [...(options.edges ?? [])];

  return {
    state: {
      schedules,
      tasks,
      workflows,
    },
    repositories: {
      agentsRepository: {
        upsert: vi.fn(async () => undefined),
        findAll: vi.fn(async () => Array.from(agents.values())),
        findEnabled: vi.fn(async () => Array.from(agents.values())),
        findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      schedulesRepository: {
        upsert: vi.fn(async (schedule: Schedule) => {
          if (options.failScheduleDisable && schedule.enabled === false) {
            throw new Error("disable failed");
          }

          schedules.set(schedule.scheduleId, schedule);
        }),
        findAll: vi.fn(async () => Array.from(schedules.values())),
        findEnabled: vi.fn(async () =>
          Array.from(schedules.values()).filter((schedule) => schedule.enabled),
        ),
        findByTarget: vi.fn(async () => [] as Schedule[]),
        findById: vi.fn(
          async (scheduleId: string) => schedules.get(scheduleId) ?? null,
        ),
        deleteById: vi.fn(async () => undefined),
      },
      tasksRepository: {
        upsert: vi.fn(async (task: Task) => {
          tasks.set(task.taskId, task);
        }),
        findByWorkflowId: vi.fn(async (workflowId: string) =>
          Array.from(tasks.values()).filter(
            (task) => task.workflowId === workflowId,
          ),
        ),
        findByStatus: vi.fn(async () => [] as Task[]),
        findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      taskEdgesRepository: {
        insert: vi.fn(async () => undefined),
        insertMany: vi.fn(async () => undefined),
        findAllByWorkflowTasks: vi.fn(async () => edges),
        findByFromTaskId: vi.fn(async () => []),
        findByToTaskId: vi.fn(async () => []),
        deleteByTaskId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
      },
      workflowsRepository: {
        upsert: vi.fn(async (workflow: Workflow) => {
          workflows.set(workflow.workflowId, workflow);
        }),
        findAll: vi.fn(async () => Array.from(workflows.values())),
        findByStatus: vi.fn(async () => [] as Workflow[]),
        findById: vi.fn(
          async (workflowId: string) => workflows.get(workflowId) ?? null,
        ),
        deleteById: vi.fn(async () => undefined),
      },
    },
  };
}

function createEnqueuePort() {
  const requests: Array<Record<string, unknown>> = [];

  return {
    requests,
    port: {
      enqueueTaskDispatch: vi.fn(async (request) => {
        requests.push(request);

        return {
          ok: true as const,
          jobId: `job-${request.taskId}`,
        };
      }),
    },
  };
}

describe("handleScheduleTrigger", () => {
  it("returns a no-op when the schedule is missing", async () => {
    const { repositories } = createRepositories({});
    const { port } = createEnqueuePort();

    await expect(
      handleScheduleTrigger(
        {
          scheduleId: "missing",
          targetType: "task",
          targetId: "task-1",
          triggeredAt: "2026-03-15T00:00:00.000Z",
        },
        repositories,
        port,
      ),
    ).resolves.toEqual({
      scheduleId: "missing",
      enqueuedTaskIds: [],
      skipped: true,
      skippedReason: "SCHEDULE_NOT_FOUND",
    });
  });

  it("enqueues a ready task target and disables a once schedule after handling", async () => {
    const schedule = createSchedule("schedule-1");
    const task = createTask("task-1", "workflow-1", { status: "ready" });
    const workflow = createWorkflow("workflow-1");
    const { repositories, state } = createRepositories({
      schedules: [schedule],
      tasks: [task],
      workflows: [workflow],
      agents: [createAgent("agent-1")],
    });
    const { port, requests } = createEnqueuePort();

    const result = await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "task",
        targetId: "task-1",
        triggeredAt: "2026-03-15T00:30:00.000Z",
      },
      repositories,
      port,
      {
        now: () => "2026-03-15T00:31:00.000Z",
      },
    );

    expect(result).toEqual({
      scheduleId: "schedule-1",
      enqueuedTaskIds: ["task-1"],
      skipped: false,
    });
    expect(requests).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        workflowId: "workflow-1",
        triggerSource: "schedule",
        requestedAt: "2026-03-15T00:30:00.000Z",
      }),
    ]);
    expect(state.tasks.get("task-1")).toMatchObject({
      status: "queued",
      assigneeAgentId: "agent-1",
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "running",
    });
    expect(state.schedules.get("schedule-1")).toMatchObject({
      enabled: false,
      updatedAt: "2026-03-15T00:31:00.000Z",
    });
  });

  it("treats a once schedule as disabled on re-entry after it has already been handled", async () => {
    const schedule = createSchedule("schedule-1");
    const task = createTask("task-1", "workflow-1", { status: "ready" });
    const workflow = createWorkflow("workflow-1");
    const { repositories, state } = createRepositories({
      schedules: [schedule],
      tasks: [task],
      workflows: [workflow],
      agents: [createAgent("agent-1")],
    });
    const { port, requests } = createEnqueuePort();

    await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "task",
        targetId: "task-1",
        triggeredAt: "2026-03-15T00:30:00.000Z",
      },
      repositories,
      port,
      {
        now: () => "2026-03-15T00:31:00.000Z",
      },
    );

    expect(state.schedules.get("schedule-1")).toMatchObject({
      enabled: false,
    });

    const secondResult = await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "task",
        targetId: "task-1",
        triggeredAt: "2026-03-15T00:32:00.000Z",
      },
      repositories,
      port,
      {
        now: () => "2026-03-15T00:33:00.000Z",
      },
    );

    expect(secondResult).toEqual({
      scheduleId: "schedule-1",
      enqueuedTaskIds: [],
      skipped: true,
      skippedReason: "SCHEDULE_DISABLED",
    });
    expect(requests).toHaveLength(1);
  });

  it.each([
    "pending",
    "blocked",
    "queued",
    "running",
    "succeeded",
    "failed",
  ] as const)(
    "skips task targets that are %s without enqueueing them",
    async (status) => {
      const schedule = createSchedule("schedule-1");
      const task = createTask("task-1", "workflow-1", { status });
      const workflow = createWorkflow("workflow-1");
      const { repositories, state } = createRepositories({
        schedules: [schedule],
        tasks: [task],
        workflows: [workflow],
        agents: [createAgent("agent-1")],
      });
      const { port, requests } = createEnqueuePort();

      const result = await handleScheduleTrigger(
        {
          scheduleId: "schedule-1",
          targetType: "task",
          targetId: "task-1",
          triggeredAt: "2026-03-15T00:30:00.000Z",
        },
        repositories,
        port,
      );

      expect(result).toEqual({
        scheduleId: "schedule-1",
        enqueuedTaskIds: [],
        skipped: true,
        skippedReason: "TASK_NOT_READY",
      });
      expect(requests).toEqual([]);
      expect(state.schedules.get("schedule-1")).toMatchObject({
        enabled: false,
      });
    },
  );

  it("treats missing workflows as a no-op", async () => {
    const schedule = createSchedule("schedule-1", {
      targetType: "workflow",
      targetId: "workflow-1",
    });
    const { repositories } = createRepositories({
      schedules: [schedule],
    });
    const { port } = createEnqueuePort();

    await expect(
      handleScheduleTrigger(
        {
          scheduleId: "schedule-1",
          targetType: "workflow",
          targetId: "workflow-1",
          triggeredAt: "2026-03-15T00:00:00.000Z",
        },
        repositories,
        port,
      ),
    ).resolves.toEqual({
      scheduleId: "schedule-1",
      enqueuedTaskIds: [],
      skipped: true,
      skippedReason: "WORKFLOW_NOT_FOUND",
    });
  });

  it("skips failed workflows and does not enqueue anything", async () => {
    const schedule = createSchedule("schedule-1", {
      targetType: "workflow",
      targetId: "workflow-1",
      type: "cron",
    });
    const workflow = createWorkflow("workflow-1", { status: "failed" });
    const { repositories } = createRepositories({
      schedules: [schedule],
      workflows: [workflow],
    });
    const { port, requests } = createEnqueuePort();

    const result = await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-1",
        triggeredAt: "2026-03-15T00:00:00.000Z",
      },
      repositories,
      port,
    );

    expect(result.skippedReason).toBe("WORKFLOW_FAILED");
    expect(requests).toEqual([]);
  });

  it("enqueues only ready root workflow kickoff tasks and includes already-ready roots", async () => {
    const schedule = createSchedule("schedule-1", {
      targetType: "workflow",
      targetId: "workflow-1",
    });
    const workflow = createWorkflow("workflow-1");
    const rootReady = createTask("task-ready", workflow.workflowId, {
      status: "ready",
    });
    const rootBlocked = createTask("task-blocked", workflow.workflowId, {
      status: "blocked",
    });
    const nonRoot = createTask("task-child", workflow.workflowId, {
      status: "pending",
    });
    const runningRoot = createTask("task-running", workflow.workflowId, {
      status: "running",
    });
    const { repositories } = createRepositories({
      schedules: [schedule],
      workflows: [workflow],
      tasks: [rootReady, rootBlocked, nonRoot, runningRoot],
      agents: [createAgent("agent-1")],
      edges: [createEdge("task-ready", "task-child")],
    });
    const { port, requests } = createEnqueuePort();

    const result = await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-1",
        triggeredAt: "2026-03-15T00:00:00.000Z",
      },
      repositories,
      port,
    );

    expect(result).toEqual({
      scheduleId: "schedule-1",
      enqueuedTaskIds: ["task-ready", "task-blocked"],
      skipped: false,
    });
    expect(requests.map((request) => request.taskId)).toEqual([
      "task-ready",
      "task-blocked",
    ]);
  });

  it("swallows once disable persistence failures and still completes the worker path", async () => {
    const logError = vi.fn();
    const schedule = createSchedule("schedule-1");
    const task = createTask("task-1", "workflow-1", { status: "ready" });
    const workflow = createWorkflow("workflow-1");
    const { repositories } = createRepositories({
      schedules: [schedule],
      tasks: [task],
      workflows: [workflow],
      agents: [createAgent("agent-1")],
      failScheduleDisable: true,
    });
    const { port } = createEnqueuePort();

    await expect(
      handleScheduleTrigger(
        {
          scheduleId: "schedule-1",
          targetType: "task",
          targetId: "task-1",
          triggeredAt: "2026-03-15T00:30:00.000Z",
        },
        repositories,
        port,
        { logError },
      ),
    ).resolves.toEqual({
      scheduleId: "schedule-1",
      enqueuedTaskIds: ["task-1"],
      skipped: false,
    });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("keeps cron schedules enabled after handling", async () => {
    const schedule = createSchedule("schedule-1", {
      type: "cron",
      runAt: undefined,
      cronExpression: "0 * * * *",
    });
    const task = createTask("task-1", "workflow-1", { status: "ready" });
    const workflow = createWorkflow("workflow-1");
    const { repositories, state } = createRepositories({
      schedules: [schedule],
      tasks: [task],
      workflows: [workflow],
      agents: [createAgent("agent-1")],
    });
    const { port } = createEnqueuePort();

    await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "task",
        targetId: "task-1",
        triggeredAt: "2026-03-15T00:30:00.000Z",
      },
      repositories,
      port,
    );

    expect(state.schedules.get("schedule-1")).toMatchObject({
      enabled: true,
    });
  });
});
