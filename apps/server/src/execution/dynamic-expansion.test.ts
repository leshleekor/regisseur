import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  Run,
  Task,
  TaskEdge,
  Workflow,
} from "@regisseur/core";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import {
  applyDynamicExpansion,
  parseDynamicSpawnDirective,
  PER_COMPLETION_DYNAMIC_TASK_LIMIT,
  WORKFLOW_DYNAMIC_TASK_LIMIT,
  type DynamicSpawnDirective,
} from "./dynamic-expansion.js";

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
    status: "running",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
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
    status: "queued",
    retryCount: 0,
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
    ...overrides,
  };
}

function createDirective(
  overrides: Partial<DynamicSpawnDirective> = {},
): DynamicSpawnDirective {
  return {
    tasks: [
      {
        taskKey: "task-b",
        title: "Task B",
        payload: { step: "b" },
        defaultAssigneeAgentId: "agent-1",
        retryCount: 0,
      },
      {
        taskKey: "task-c",
        title: "Task C",
        payload: { step: "c" },
        defaultAssigneeAgentId: "agent-1",
        retryCount: 0,
      },
    ],
    edges: [
      {
        from: "task-a",
        to: "task-b",
        type: "depends_on",
      },
      {
        from: "task-b",
        to: "task-c",
        type: "depends_on",
      },
    ],
    ...overrides,
  };
}

function createRepositories(options: {
  tasks?: readonly Task[];
  workflow?: Workflow;
  agents?: readonly AgentDefinition[];
  edges?: readonly TaskEdge[];
  runs?: readonly Run[];
}) {
  const tasks = new Map(
    (options.tasks ?? []).map((task) => [task.taskId, task]),
  );
  const agents = new Map(
    (options.agents ?? [createAgent("agent-1")]).map((agent) => [
      agent.agentId,
      agent,
    ]),
  );
  const edges = [...(options.edges ?? [])];
  const runs = [...(options.runs ?? [])];
  const workflow = options.workflow ?? createWorkflow("workflow-1");

  return {
    state: {
      tasks,
      agents,
      edges,
      runs,
      workflow,
    },
    repositories: {
      agentsRepository: {
        findAll: vi.fn(async () => Array.from(agents.values())),
        findEnabled: vi.fn(async () => Array.from(agents.values())),
        findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
        upsert: vi.fn(async () => undefined),
        deleteById: vi.fn(async () => undefined),
      },
      runsRepository: {
        findLatestSucceededByTaskId: vi.fn(
          async (taskId: string) =>
            runs
              .filter(
                (run) => run.taskId === taskId && run.status === "succeeded",
              )
              .sort((left, right) =>
                (right.finishedAt ?? right.createdAt).localeCompare(
                  left.finishedAt ?? left.createdAt,
                ),
              )[0] ?? null,
        ),
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
        countByWorkflowIdAndGenerationSource: vi.fn(
          async (workflowId: string, source: Task["generationSource"]) =>
            Array.from(tasks.values()).filter(
              (task) =>
                task.workflowId === workflowId &&
                task.generationSource === source,
            ).length,
        ),
        findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      taskEdgesRepository: {
        insert: vi.fn(async (edge: TaskEdge) => {
          edges.push(edge);
        }),
        insertMany: vi.fn(async (nextEdges: readonly TaskEdge[]) => {
          edges.push(...nextEdges);
        }),
        findAllByWorkflowTasks: vi.fn(async () => edges),
        findByFromTaskId: vi.fn(async () => [] as TaskEdge[]),
        findByToTaskId: vi.fn(async () => [] as TaskEdge[]),
        deleteByTaskId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
      },
      workflowsRepository: {
        findById: vi.fn(async () => workflow),
        findAll: vi.fn(async () => [workflow]),
        findByStatus: vi.fn(async () => [] as Workflow[]),
        upsert: vi.fn(async () => undefined),
        deleteById: vi.fn(async () => undefined),
      },
    },
  };
}

function createEnqueuePort(): DispatchEnqueuePort {
  return {
    enqueueTaskDispatch: vi.fn(async (request) => ({
      ok: true as const,
      jobId: `job-${request.taskId}`,
    })),
  };
}

describe("parseDynamicSpawnDirective", () => {
  it("parses a valid spawn directive", () => {
    expect(
      parseDynamicSpawnDirective({
        orchestration: {
          spawn: {
            tasks: [
              {
                taskKey: "task-b",
                title: "Task B",
                payload: { step: "b" },
                defaultAssigneeAgentId: "agent-1",
                retryCount: 1,
              },
            ],
            edges: [
              {
                from: "task-a",
                to: "task-b",
              },
            ],
          },
        },
      }),
    ).toEqual({
      ok: true,
      directive: {
        tasks: [
          {
            taskKey: "task-b",
            title: "Task B",
            payload: { step: "b" },
            defaultAssigneeAgentId: "agent-1",
            retryCount: 1,
          },
        ],
        edges: [
          {
            from: "task-a",
            to: "task-b",
            type: "depends_on",
          },
        ],
      },
    });
  });

  it("rejects invalid directive shapes", () => {
    expect(
      parseDynamicSpawnDirective({
        orchestration: {
          spawn: {
            tasks: [],
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      reason: "INVALID_DYNAMIC_SPAWN_DIRECTIVE",
    });
  });
});

describe("applyDynamicExpansion", () => {
  it("rejects spawn directives that exceed the per-completion cap", async () => {
    const currentTask = createTask("task-a", "workflow-1", {
      status: "succeeded",
    });
    const { repositories } = createRepositories({
      tasks: [currentTask],
    });

    const result = await applyDynamicExpansion(
      currentTask,
      createWorkflow("workflow-1"),
      {
        tasks: Array.from(
          { length: PER_COMPLETION_DYNAMIC_TASK_LIMIT + 1 },
          (_, index) => ({
            taskKey: `task-${index}`,
            title: `Task ${index}`,
            payload: {},
            retryCount: 0,
          }),
        ),
        edges: [],
      },
      repositories,
      createEnqueuePort(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "PER_COMPLETION_DYNAMIC_TASK_LIMIT_EXCEEDED",
    });
  });

  it("rejects workflow-level dynamic cap overflow", async () => {
    const currentTask = createTask("task-a", "workflow-1", {
      status: "succeeded",
    });
    const existingDynamicTasks = Array.from(
      { length: WORKFLOW_DYNAMIC_TASK_LIMIT },
      (_, index) =>
        createTask(`dynamic-${index}`, "workflow-1", {
          generationSource: "dynamic",
        }),
    );
    const { repositories } = createRepositories({
      tasks: [currentTask, ...existingDynamicTasks],
    });

    const result = await applyDynamicExpansion(
      currentTask,
      createWorkflow("workflow-1"),
      createDirective({
        tasks: [
          {
            taskKey: "task-b",
            title: "Task B",
            payload: {},
            retryCount: 0,
          },
        ],
        edges: [],
      }),
      repositories,
      createEnqueuePort(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "WORKFLOW_DYNAMIC_TASK_LIMIT_EXCEEDED",
    });
  });

  it("rejects backward edges to unrelated existing tasks", async () => {
    const currentTask = createTask("task-a", "workflow-1", {
      status: "succeeded",
    });
    const { repositories } = createRepositories({
      tasks: [currentTask, createTask("existing-task", "workflow-1")],
    });

    const result = await applyDynamicExpansion(
      currentTask,
      createWorkflow("workflow-1"),
      createDirective({
        tasks: [
          {
            taskKey: "task-b",
            title: "Task B",
            payload: {},
            retryCount: 0,
          },
        ],
        edges: [
          {
            from: "existing-task",
            to: "task-b",
            type: "depends_on",
          },
        ],
      }),
      repositories,
      createEnqueuePort(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "INVALID_DYNAMIC_SPAWN_EDGE",
    });
  });

  it("rejects cycles inside the spawned subgraph", async () => {
    const currentTask = createTask("task-a", "workflow-1", {
      status: "succeeded",
    });
    const { repositories } = createRepositories({
      tasks: [currentTask],
    });

    const result = await applyDynamicExpansion(
      currentTask,
      createWorkflow("workflow-1"),
      createDirective({
        edges: [
          {
            from: "task-a",
            to: "task-b",
            type: "depends_on",
          },
          {
            from: "task-b",
            to: "task-c",
            type: "depends_on",
          },
          {
            from: "task-c",
            to: "task-b",
            type: "depends_on",
          },
        ],
      }),
      repositories,
      createEnqueuePort(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "DYNAMIC_SPAWN_SUBGRAPH_CYCLE",
    });
  });

  it("creates spawned runtime tasks, edges, and enqueues only ready spawned roots", async () => {
    const currentTask = createTask("task-a", "workflow-1", {
      status: "succeeded",
      assigneeAgentId: "agent-1",
    });
    const { repositories, state } = createRepositories({
      tasks: [currentTask],
      workflow: createWorkflow("workflow-1", { status: "running" }),
    });
    const enqueuePort = createEnqueuePort();

    const result = await applyDynamicExpansion(
      currentTask,
      state.workflow,
      createDirective(),
      repositories,
      enqueuePort,
      {
        now: () => "2026-03-17T00:05:00.000Z",
        randomUUIDImpl: vi
          .fn()
          .mockReturnValueOnce("task-b-runtime")
          .mockReturnValueOnce("task-c-runtime"),
      },
    );

    expect(result).toEqual({
      ok: true,
      applied: true,
      createdTaskIds: ["task-b-runtime", "task-c-runtime"],
      enqueuedTaskIds: ["task-b-runtime"],
      failures: [],
    });
    expect(state.tasks.get("task-b-runtime")).toMatchObject({
      status: "queued",
      spawnedFromTaskId: "task-a",
      generationSource: "dynamic",
    });
    expect(state.tasks.get("task-c-runtime")).toMatchObject({
      status: "blocked",
      spawnedFromTaskId: "task-a",
      generationSource: "dynamic",
    });
    expect(state.edges).toEqual([
      {
        fromTaskId: "task-a",
        toTaskId: "task-b-runtime",
        type: "depends_on",
      },
      {
        fromTaskId: "task-b-runtime",
        toTaskId: "task-c-runtime",
        type: "depends_on",
      },
    ]);
    expect(enqueuePort.enqueueTaskDispatch).toHaveBeenCalledTimes(1);
  });

  it("keeps spawned task payload unchanged because dynamic spawn edges do not inject output", async () => {
    const currentTask = createTask("task-a", "workflow-1", {
      status: "succeeded",
    });
    const { repositories, state } = createRepositories({
      tasks: [currentTask],
      workflow: createWorkflow("workflow-1", { status: "running" }),
    });

    const result = await applyDynamicExpansion(
      currentTask,
      state.workflow,
      createDirective({
        tasks: [
          {
            taskKey: "task-b",
            title: "Task B",
            payload: { seeded: true },
            defaultAssigneeAgentId: "agent-1",
            retryCount: 0,
          },
        ],
        edges: [],
      }),
      repositories,
      createEnqueuePort(),
      {
        now: () => "2026-03-17T00:05:00.000Z",
        randomUUIDImpl: vi.fn().mockReturnValueOnce("task-b-runtime"),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      enqueuedTaskIds: ["task-b-runtime"],
    });
    expect(state.tasks.get("task-b-runtime")).toMatchObject({
      payload: { seeded: true },
    });
  });

  it("rejects dynamic expansion for terminal workflows", async () => {
    const currentTask = createTask("task-a", "workflow-1", {
      status: "succeeded",
    });
    const { repositories } = createRepositories({
      tasks: [currentTask],
    });

    const result = await applyDynamicExpansion(
      currentTask,
      createWorkflow("workflow-1", { status: "failed" }),
      createDirective({
        tasks: [
          {
            taskKey: "task-b",
            title: "Task B",
            payload: {},
            retryCount: 0,
          },
        ],
        edges: [],
      }),
      repositories,
      createEnqueuePort(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "TERMINAL_WORKFLOW",
    });
  });
});
