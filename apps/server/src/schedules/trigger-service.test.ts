import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  LoopDefinition,
  Schedule,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
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

function createWorkflowDefinition(
  workflowDefinitionId: string,
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    workflowDefinitionId,
    name: workflowDefinitionId,
    enabled: true,
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

function createTaskTemplate(
  taskTemplateId: string,
  workflowDefinitionId: string,
  overrides: Partial<TaskTemplate> = {},
): TaskTemplate {
  return {
    taskTemplateId,
    workflowDefinitionId,
    title: taskTemplateId,
    payload: {},
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

function createTaskTemplateEdge(
  fromTaskTemplateId: string,
  toTaskTemplateId: string,
): TaskTemplateEdge {
  return {
    fromTaskTemplateId,
    toTaskTemplateId,
    type: "depends_on",
  };
}

function createRepositories(options: {
  schedules?: readonly Schedule[];
  tasks?: readonly Task[];
  workflows?: readonly Workflow[];
  workflowDefinitions?: readonly WorkflowDefinition[];
  taskTemplates?: readonly TaskTemplate[];
  taskTemplateEdges?: readonly TaskTemplateEdge[];
  loopDefinitions?: readonly LoopDefinition[];
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
  const workflowDefinitions = new Map(
    (options.workflowDefinitions ?? []).map((workflowDefinition) => [
      workflowDefinition.workflowDefinitionId,
      workflowDefinition,
    ]),
  );
  const taskTemplates = new Map(
    (options.taskTemplates ?? []).map((taskTemplate) => [
      taskTemplate.taskTemplateId,
      taskTemplate,
    ]),
  );
  const taskTemplateEdges = [...(options.taskTemplateEdges ?? [])];
  const loopDefinitions = new Map(
    (options.loopDefinitions ?? []).map((loopDefinition) => [
      loopDefinition.loopDefinitionId,
      loopDefinition,
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
      taskEdges: edges,
      workflowDefinitions,
      loopDefinitions,
      taskTemplates,
      taskTemplateEdges,
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
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
        findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      taskEdgesRepository: {
        insert: vi.fn(async (taskEdge: TaskEdge) => {
          edges.push(taskEdge);
        }),
        insertMany: vi.fn(async (nextTaskEdges: readonly TaskEdge[]) => {
          edges.push(...nextTaskEdges);
        }),
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
      workflowDefinitionsRepository: {
        upsert: vi.fn(async (workflowDefinition: WorkflowDefinition) => {
          workflowDefinitions.set(
            workflowDefinition.workflowDefinitionId,
            workflowDefinition,
          );
        }),
        findAll: vi.fn(async () => Array.from(workflowDefinitions.values())),
        findEnabled: vi.fn(async () =>
          Array.from(workflowDefinitions.values()).filter(
            (workflowDefinition) => workflowDefinition.enabled,
          ),
        ),
        findById: vi.fn(
          async (workflowDefinitionId: string) =>
            workflowDefinitions.get(workflowDefinitionId) ?? null,
        ),
        deleteById: vi.fn(async () => undefined),
      },
      loopDefinitionsRepository: {
        upsert: vi.fn(async (loopDefinition: LoopDefinition) => {
          loopDefinitions.set(loopDefinition.loopDefinitionId, loopDefinition);
        }),
        findByWorkflowDefinitionId: vi.fn(
          async (workflowDefinitionId: string) =>
            Array.from(loopDefinitions.values()).find(
              (loopDefinition) =>
                loopDefinition.workflowDefinitionId === workflowDefinitionId,
            ) ?? null,
        ),
        findById: vi.fn(
          async (loopDefinitionId: string) =>
            loopDefinitions.get(loopDefinitionId) ?? null,
        ),
        deleteById: vi.fn(async () => undefined),
      },
      taskTemplatesRepository: {
        upsert: vi.fn(async (taskTemplate: TaskTemplate) => {
          taskTemplates.set(taskTemplate.taskTemplateId, taskTemplate);
        }),
        findByWorkflowDefinitionId: vi.fn(
          async (workflowDefinitionId: string) =>
            Array.from(taskTemplates.values()).filter(
              (taskTemplate) =>
                taskTemplate.workflowDefinitionId === workflowDefinitionId,
            ),
        ),
        findById: vi.fn(
          async (taskTemplateId: string) =>
            taskTemplates.get(taskTemplateId) ?? null,
        ),
        deleteById: vi.fn(async () => undefined),
      },
      taskTemplateEdgesRepository: {
        insert: vi.fn(async (taskTemplateEdge: TaskTemplateEdge) => {
          taskTemplateEdges.push(taskTemplateEdge);
        }),
        insertMany: vi.fn(
          async (nextTaskTemplateEdges: readonly TaskTemplateEdge[]) => {
            taskTemplateEdges.push(...nextTaskTemplateEdges);
          },
        ),
        findAllByWorkflowDefinitionTaskTemplates: vi.fn(
          async (taskTemplateIds: readonly string[]) => {
            const taskTemplateIdSet = new Set(taskTemplateIds);

            return taskTemplateEdges.filter(
              (taskTemplateEdge) =>
                taskTemplateIdSet.has(taskTemplateEdge.fromTaskTemplateId) &&
                taskTemplateIdSet.has(taskTemplateEdge.toTaskTemplateId),
            );
          },
        ),
        findByFromTaskTemplateId: vi.fn(async () => []),
        findByToTaskTemplateId: vi.fn(async () => []),
        deleteByTaskTemplateId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
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

  it("treats missing workflow definitions as a no-op", async () => {
    const schedule = createSchedule("schedule-1", {
      targetType: "workflow",
      targetId: "workflow-definition-1",
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
          targetId: "workflow-definition-1",
          triggeredAt: "2026-03-15T00:00:00.000Z",
        },
        repositories,
        port,
      ),
    ).resolves.toEqual({
      scheduleId: "schedule-1",
      enqueuedTaskIds: [],
      skipped: true,
      skippedReason: "DEFINITION_NOT_FOUND",
    });
  });

  it("treats disabled workflow definitions as a no-op", async () => {
    const schedule = createSchedule("schedule-1", {
      targetType: "workflow",
      targetId: "workflow-definition-1",
      type: "cron",
    });
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
      {
        enabled: false,
      },
    );
    const { repositories } = createRepositories({
      schedules: [schedule],
      workflowDefinitions: [workflowDefinition],
    });
    const { port, requests } = createEnqueuePort();

    const result = await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-definition-1",
        triggeredAt: "2026-03-15T00:00:00.000Z",
      },
      repositories,
      port,
    );

    expect(result.skippedReason).toBe("DEFINITION_DISABLED");
    expect(requests).toEqual([]);
  });

  it("materializes a fresh runtime workflow from a workflow definition target", async () => {
    const schedule = createSchedule("schedule-1", {
      targetType: "workflow",
      targetId: "workflow-definition-1",
    });
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
    );
    const rootTemplate = createTaskTemplate(
      "task-template-root",
      workflowDefinition.workflowDefinitionId,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const childTemplate = createTaskTemplate(
      "task-template-child",
      workflowDefinition.workflowDefinitionId,
    );
    const { repositories, state } = createRepositories({
      schedules: [schedule],
      workflowDefinitions: [workflowDefinition],
      taskTemplates: [rootTemplate, childTemplate],
      taskTemplateEdges: [
        createTaskTemplateEdge(
          rootTemplate.taskTemplateId,
          childTemplate.taskTemplateId,
        ),
      ],
      agents: [createAgent("agent-1")],
    });
    const { port, requests } = createEnqueuePort();

    const result = await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-definition-1",
        triggeredAt: "2026-03-15T00:00:00.000Z",
      },
      repositories,
      port,
    );

    expect(result).toEqual({
      scheduleId: "schedule-1",
      enqueuedTaskIds: expect.arrayContaining([expect.any(String)]),
      skipped: false,
    });
    expect(requests).toHaveLength(1);
    expect(state.workflows.size).toBe(1);
    expect(state.tasks.size).toBe(2);
    expect(state.taskEdges).toHaveLength(1);
    expect(Array.from(state.workflows.values())[0]).toMatchObject({
      workflowDefinitionId: workflowDefinition.workflowDefinitionId,
      triggerSource: "schedule",
      triggeredByScheduleId: "schedule-1",
      status: "running",
    });
    expect(Array.from(state.tasks.values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskTemplateId: rootTemplate.taskTemplateId,
          status: "queued",
        }),
        expect.objectContaining({
          taskTemplateId: childTemplate.taskTemplateId,
          status: "blocked",
        }),
      ]),
    );
  });

  it("creates a fresh runtime workflow every time a workflow definition schedule fires", async () => {
    const schedule = createSchedule("schedule-1", {
      type: "cron",
      runAt: undefined,
      cronExpression: "0 * * * *",
      targetType: "workflow",
      targetId: "workflow-definition-1",
    });
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
    );
    const rootTemplate = createTaskTemplate(
      "task-template-root",
      workflowDefinition.workflowDefinitionId,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const { repositories, state } = createRepositories({
      schedules: [schedule],
      workflowDefinitions: [workflowDefinition],
      taskTemplates: [rootTemplate],
      agents: [createAgent("agent-1")],
    });
    const { port } = createEnqueuePort();

    const firstResult = await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-definition-1",
        triggeredAt: "2026-03-15T00:00:00.000Z",
      },
      repositories,
      port,
    );
    const firstWorkflowId = Array.from(state.workflows.keys())[0];
    const firstTaskIds = Array.from(state.tasks.keys());

    const secondResult = await handleScheduleTrigger(
      {
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-definition-1",
        triggeredAt: "2026-03-15T01:00:00.000Z",
      },
      repositories,
      port,
    );
    const workflowIds = Array.from(state.workflows.keys());
    const taskIds = Array.from(state.tasks.keys());

    expect(firstResult.skipped).toBe(false);
    expect(secondResult.skipped).toBe(false);
    expect(workflowIds).toHaveLength(2);
    expect(workflowIds[0]).toBe(firstWorkflowId);
    expect(workflowIds[1]).not.toBe(firstWorkflowId);
    expect(taskIds).toHaveLength(2);
    expect(taskIds[0]).toBe(firstTaskIds[0]);
    expect(taskIds[1]).not.toBe(firstTaskIds[0]);
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
