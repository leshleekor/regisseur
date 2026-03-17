import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
} from "@regisseur/core";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";
import type { TaskDispatchJobPayload } from "@regisseur/queue-bullmq";

import type { ExecutableAdapterRegistry } from "../types.js";
import { executeTaskLifecycle } from "./execution-service.js";

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
    status: "queued",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createPayload(task: Task): TaskDispatchJobPayload {
  return {
    taskId: task.taskId,
    workflowId: task.workflowId,
    triggerSource: "manual",
    requestedAt: "2026-03-15T00:00:00.000Z",
  };
}

function createLoopDefinition(
  workflowDefinitionId: string,
  overrides: Partial<LoopDefinition> = {},
): LoopDefinition {
  return {
    loopDefinitionId: "loop-1",
    workflowDefinitionId,
    name: "Review Loop",
    controllerTaskTemplateId: "review-template",
    entryTaskTemplateIds: ["dev-template"],
    bodyTaskTemplateIds: ["dev-template", "review-template"],
    maxIterations: 3,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createRepositories(options: {
  task?: Task | null;
  workflow?: Workflow | null;
  agent?: AgentDefinition | null;
  edges?: readonly TaskEdge[];
  loopDefinition?: LoopDefinition | null;
  taskTemplates?: readonly TaskTemplate[];
  taskTemplateEdges?: readonly TaskTemplateEdge[];
}) {
  const tasks = new Map<string, Task>();
  const workflows = new Map<string, Workflow>();
  const agents = new Map<string, AgentDefinition>();
  const runs = new Map<string, Run>();
  const edges = [...(options.edges ?? [])];
  const loopDefinitions = new Map<string, LoopDefinition>();
  const taskTemplates = new Map<string, TaskTemplate>(
    (options.taskTemplates ?? []).map((taskTemplate) => [
      taskTemplate.taskTemplateId,
      taskTemplate,
    ]),
  );
  const taskTemplateEdges = [...(options.taskTemplateEdges ?? [])];

  if (options.task) {
    tasks.set(options.task.taskId, options.task);
  }

  if (options.workflow) {
    workflows.set(options.workflow.workflowId, options.workflow);
  }

  if (options.agent) {
    agents.set(options.agent.agentId, options.agent);
  }

  if (options.loopDefinition) {
    loopDefinitions.set(
      options.loopDefinition.loopDefinitionId,
      options.loopDefinition,
    );
  }

  return {
    state: {
      tasks,
      workflows,
      agents,
      runs,
      edges,
    },
    repositories: {
      tasksRepository: {
        findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
        findByWorkflowId: vi.fn(async (workflowId: string) =>
          Array.from(tasks.values()).filter(
            (task) => task.workflowId === workflowId,
          ),
        ),
        findByStatus: vi.fn(async () => []),
        countByWorkflowIdAndGenerationSource: vi.fn(
          async (workflowId: string, source: Task["generationSource"]) =>
            Array.from(tasks.values()).filter(
              (task) =>
                task.workflowId === workflowId &&
                task.generationSource === source,
            ).length,
        ),
        upsert: vi.fn(async (task: Task) => {
          tasks.set(task.taskId, task);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      workflowsRepository: {
        findById: vi.fn(
          async (workflowId: string) => workflows.get(workflowId) ?? null,
        ),
        findAll: vi.fn(async () => Array.from(workflows.values())),
        findByStatus: vi.fn(async () => []),
        upsert: vi.fn(async (workflow: Workflow) => {
          workflows.set(workflow.workflowId, workflow);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      agentsRepository: {
        findAll: vi.fn(async () => Array.from(agents.values())),
        findEnabled: vi.fn(async () =>
          Array.from(agents.values()).filter((agent) => agent.enabled),
        ),
        findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
        upsert: vi.fn(async (agent: AgentDefinition) => {
          agents.set(agent.agentId, agent);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      runsRepository: {
        findById: vi.fn(async (runId: string) => runs.get(runId) ?? null),
        findByTaskId: vi.fn(async (taskId: string) =>
          Array.from(runs.values()).filter((run) => run.taskId === taskId),
        ),
        findByAgentId: vi.fn(async (agentId: string) =>
          Array.from(runs.values()).filter((run) => run.agentId === agentId),
        ),
        findByStatus: vi.fn(async () => []),
        upsert: vi.fn(async (run: Run) => {
          runs.set(run.runId, run);
        }),
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
        insert: vi.fn(async () => undefined),
        insertMany: vi.fn(async () => undefined),
        findAllByWorkflowDefinitionTaskTemplates: vi.fn(
          async (taskTemplateIds: readonly string[]) => {
            const taskTemplateIdSet = new Set(taskTemplateIds);

            return taskTemplateEdges.filter(
              (edge) =>
                taskTemplateIdSet.has(edge.fromTaskTemplateId) &&
                taskTemplateIdSet.has(edge.toTaskTemplateId),
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

function createEnqueuePort(): DispatchEnqueuePort {
  return {
    enqueueTaskDispatch: vi.fn(async () => ({
      ok: true as const,
      jobId: "job-1",
    })),
  };
}

describe("executeTaskLifecycle", () => {
  it("creates a run, marks the task succeeded, stores output, and updates the workflow on success", async () => {
    const task = createTask("task-1", "workflow-1", {
      assigneeAgentId: "agent-1",
    });
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const agent = createAgent("agent-1");
    const { state, repositories } = createRepositories({
      task,
      workflow,
      agent,
    });
    const progressDownstreamTasksImpl = vi.fn(async () => ({
      enqueuedTaskIds: [],
      skippedTaskIds: [],
      failures: [],
      skippedBecauseWorkflowFailed: false,
    }));
    const registry: ExecutableAdapterRegistry = {
      cli: {
        runtimeType: "cli",
        execute: vi.fn(async () => ({
          ok: true as const,
          output: { result: "done" },
        })),
      },
    };

    const result = await executeTaskLifecycle(
      createPayload(task),
      repositories,
      registry,
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: () => "run-1",
        progressDownstreamTasksImpl,
      },
    );

    expect(result).toEqual({
      ok: true,
      run: expect.objectContaining({
        runId: "run-1",
        status: "succeeded",
        output: { result: "done" },
      }),
      task: expect.objectContaining({
        taskId: "task-1",
        status: "succeeded",
      }),
    });
    expect(state.runs.get("run-1")).toMatchObject({
      status: "succeeded",
      output: { result: "done" },
    });
    expect(state.tasks.get("task-1")).toMatchObject({
      status: "succeeded",
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "succeeded",
    });
    expect(progressDownstreamTasksImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        status: "succeeded",
      }),
      repositories,
      expect.any(Object),
      {
        now: expect.any(Function),
      },
    );
  });

  it("applies dynamic expansion and still runs static downstream progression", async () => {
    const task = createTask("task-1", "workflow-1", {
      assigneeAgentId: "agent-1",
    });
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const agent = createAgent("agent-1");
    const { repositories } = createRepositories({
      task,
      workflow,
      agent,
    });
    const progressDownstreamTasksImpl = vi.fn(async () => ({
      enqueuedTaskIds: [],
      skippedTaskIds: [],
      failures: [],
      skippedBecauseWorkflowFailed: false,
    }));
    const applyDynamicExpansionImpl = vi.fn(async () => ({
      ok: true as const,
      applied: true,
      createdTaskIds: ["dynamic-task-1"],
      enqueuedTaskIds: ["dynamic-task-1"],
      failures: [],
    }));

    await executeTaskLifecycle(
      createPayload(task),
      repositories,
      {
        cli: {
          runtimeType: "cli",
          execute: vi.fn(async () => ({
            ok: true as const,
            output: {
              orchestration: {
                spawn: {
                  tasks: [
                    {
                      taskKey: "dynamic-task-1",
                      title: "Dynamic Task",
                      payload: {},
                      retryCount: 0,
                    },
                  ],
                },
              },
            },
          })),
        },
      },
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: () => "run-1",
        applyDynamicExpansionImpl,
        progressDownstreamTasksImpl,
      },
    );

    expect(applyDynamicExpansionImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        status: "succeeded",
      }),
      expect.objectContaining({
        workflowId: "workflow-1",
      }),
      expect.objectContaining({
        tasks: [
          expect.objectContaining({
            taskKey: "dynamic-task-1",
          }),
        ],
      }),
      repositories,
      expect.any(Object),
      expect.objectContaining({
        now: expect.any(Function),
        randomUUIDImpl: expect.any(Function),
      }),
    );
    expect(progressDownstreamTasksImpl).toHaveBeenCalledTimes(1);
  });

  it("marks run, task, and workflow failed when adapter execution fails", async () => {
    const task = createTask("task-1", "workflow-1", {
      assigneeAgentId: "agent-1",
    });
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const agent = createAgent("agent-1");
    const { state, repositories } = createRepositories({
      task,
      workflow,
      agent,
    });
    const progressDownstreamTasksImpl = vi.fn();
    const registry: ExecutableAdapterRegistry = {
      cli: {
        runtimeType: "cli",
        execute: vi.fn(async () => ({
          ok: false,
          message: "adapter boom",
        })),
      },
    };

    const result = await executeTaskLifecycle(
      createPayload(task),
      repositories,
      registry,
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: () => "run-1",
        progressDownstreamTasksImpl,
      },
    );

    expect(result).toEqual({
      ok: false,
      reason: "EXECUTION_FAILED",
      message: "adapter boom",
    });
    expect(state.runs.get("run-1")).toMatchObject({
      status: "failed",
      error: "adapter boom",
    });
    expect(state.tasks.get("task-1")).toMatchObject({
      status: "failed",
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "failed",
    });
    expect(progressDownstreamTasksImpl).not.toHaveBeenCalled();
  });

  it("treats a missing task as an orphaned job and leaves workflow state untouched", async () => {
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const { state, repositories } = createRepositories({
      task: null,
      workflow,
      agent: null,
    });
    const logError = vi.fn();

    const result = await executeTaskLifecycle(
      {
        taskId: "missing-task",
        workflowId: "workflow-1",
        triggerSource: "manual",
        requestedAt: "2026-03-15T00:00:00.000Z",
      },
      repositories,
      {},
      createEnqueuePort(),
      {
        logError,
      },
    );

    expect(result).toEqual({
      ok: false,
      reason: "TASK_NOT_FOUND",
      message: "Task missing-task not found for queued job",
    });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(repositories.tasksRepository.upsert).not.toHaveBeenCalled();
    expect(repositories.workflowsRepository.upsert).not.toHaveBeenCalled();
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "running",
    });
  });

  it("fails the task and workflow without creating a run when assigneeAgentId is missing", async () => {
    const task = createTask("task-1", "workflow-1");
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const { state, repositories } = createRepositories({
      task,
      workflow,
      agent: null,
    });

    const result = await executeTaskLifecycle(
      createPayload(task),
      repositories,
      {},
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
      },
    );

    expect(result).toEqual({
      ok: false,
      reason: "AGENT_NOT_FOUND",
      message: "Task task-1 has no assignee agent id",
    });
    expect(state.runs.size).toBe(0);
    expect(state.tasks.get("task-1")).toMatchObject({
      status: "failed",
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "failed",
    });
  });

  it("fails the run, task, and workflow when the runtime adapter is missing", async () => {
    const task = createTask("task-1", "workflow-1", {
      assigneeAgentId: "agent-1",
    });
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const agent = createAgent("agent-1", { runtimeType: "http" });
    const { state, repositories } = createRepositories({
      task,
      workflow,
      agent,
    });
    const progressDownstreamTasksImpl = vi.fn();

    const result = await executeTaskLifecycle(
      createPayload(task),
      repositories,
      {},
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: () => "run-1",
        progressDownstreamTasksImpl,
      },
    );

    expect(result).toEqual({
      ok: false,
      reason: "ADAPTER_NOT_FOUND",
      message: "No executable adapter registered for runtime http",
    });
    expect(state.runs.get("run-1")).toMatchObject({
      status: "failed",
    });
    expect(state.tasks.get("task-1")).toMatchObject({
      status: "failed",
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "failed",
    });
    expect(progressDownstreamTasksImpl).not.toHaveBeenCalled();
  });

  it("fails the workflow when dynamic expansion rejects", async () => {
    const task = createTask("task-1", "workflow-1", {
      assigneeAgentId: "agent-1",
    });
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const agent = createAgent("agent-1");
    const { state, repositories } = createRepositories({
      task,
      workflow,
      agent,
    });
    const progressDownstreamTasksImpl = vi.fn();
    const applyDynamicExpansionImpl = vi.fn(async () => ({
      ok: false as const,
      reason: "INVALID_DYNAMIC_SPAWN_EDGE",
      message: "bad edge",
    }));

    const result = await executeTaskLifecycle(
      createPayload(task),
      repositories,
      {
        cli: {
          runtimeType: "cli",
          execute: vi.fn(async () => ({
            ok: true as const,
            output: {
              orchestration: {
                spawn: {
                  tasks: [
                    {
                      taskKey: "dynamic-task-1",
                      title: "Dynamic Task",
                      payload: {},
                      retryCount: 0,
                    },
                  ],
                },
              },
            },
          })),
        },
      },
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: () => "run-1",
        applyDynamicExpansionImpl,
        progressDownstreamTasksImpl,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      task: {
        status: "succeeded",
      },
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "failed",
    });
    expect(progressDownstreamTasksImpl).not.toHaveBeenCalled();
  });

  it("treats missing loop output as exit and keeps normal downstream progression", async () => {
    const task = createTask("review-1", "workflow-1", {
      assigneeAgentId: "agent-1",
      taskTemplateId: "review-template",
      loopDefinitionId: "loop-1",
      iteration: 1,
    });
    const workflow = createWorkflow("workflow-1", {
      workflowDefinitionId: "workflow-definition-1",
    });
    const agent = createAgent("agent-1");
    const loopDefinition = createLoopDefinition("workflow-definition-1");
    const { repositories } = createRepositories({
      task,
      workflow,
      agent,
      loopDefinition,
    });
    const progressDownstreamTasksImpl = vi.fn(async () => ({
      enqueuedTaskIds: ["deploy-1"],
      skippedTaskIds: [],
      failures: [],
      skippedBecauseWorkflowFailed: false,
    }));
    const expandLoopIterationImpl = vi.fn();

    await executeTaskLifecycle(
      createPayload(task),
      repositories,
      {
        cli: {
          runtimeType: "cli",
          execute: vi.fn(async () => ({
            ok: true as const,
            output: {},
          })),
        },
      },
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: () => "run-1",
        progressDownstreamTasksImpl,
        expandLoopIterationImpl,
      },
    );

    expect(progressDownstreamTasksImpl).toHaveBeenCalledTimes(1);
    expect(expandLoopIterationImpl).not.toHaveBeenCalled();
  });

  it("fails the workflow when a loop controller output mixes loop and spawn directives", async () => {
    const task = createTask("review-1", "workflow-1", {
      assigneeAgentId: "agent-1",
      taskTemplateId: "review-template",
      loopDefinitionId: "loop-1",
      iteration: 1,
    });
    const workflow = createWorkflow("workflow-1", {
      workflowDefinitionId: "workflow-definition-1",
    });
    const agent = createAgent("agent-1");
    const loopDefinition = createLoopDefinition("workflow-definition-1");
    const { state, repositories } = createRepositories({
      task,
      workflow,
      agent,
      loopDefinition,
    });
    const progressDownstreamTasksImpl = vi.fn();
    const expandLoopIterationImpl = vi.fn();

    await executeTaskLifecycle(
      createPayload(task),
      repositories,
      {
        cli: {
          runtimeType: "cli",
          execute: vi.fn(async () => ({
            ok: true as const,
            output: {
              loopAction: "exit",
              orchestration: {
                spawn: {
                  tasks: [
                    {
                      taskKey: "dynamic-task-1",
                      title: "Dynamic Task",
                      payload: {},
                      retryCount: 0,
                    },
                  ],
                },
              },
            },
          })),
        },
      },
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: () => "run-1",
        progressDownstreamTasksImpl,
        expandLoopIterationImpl,
      },
    );

    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "failed",
    });
    expect(progressDownstreamTasksImpl).not.toHaveBeenCalled();
    expect(expandLoopIterationImpl).not.toHaveBeenCalled();
  });

  it("skips normal downstream progression and uses loop expansion on repeat", async () => {
    const task = createTask("review-1", "workflow-1", {
      assigneeAgentId: "agent-1",
      taskTemplateId: "review-template",
      loopDefinitionId: "loop-1",
      iteration: 1,
    });
    const workflow = createWorkflow("workflow-1", {
      workflowDefinitionId: "workflow-definition-1",
    });
    const agent = createAgent("agent-1");
    const loopDefinition = createLoopDefinition("workflow-definition-1");
    const { repositories, state } = createRepositories({
      task,
      workflow,
      agent,
      loopDefinition,
    });
    const progressDownstreamTasksImpl = vi.fn();
    const expandLoopIterationImpl = vi.fn(async () => {
      state.tasks.set(
        "dev-2",
        createTask("dev-2", "workflow-1", {
          taskTemplateId: "dev-template",
          loopDefinitionId: "loop-1",
          iteration: 2,
          spawnedFromTaskId: "review-1",
          status: "queued",
        }),
      );
      state.tasks.set(
        "review-2",
        createTask("review-2", "workflow-1", {
          taskTemplateId: "review-template",
          loopDefinitionId: "loop-1",
          iteration: 2,
          spawnedFromTaskId: "review-1",
          status: "blocked",
        }),
      );

      return {
        ok: true as const,
        createdTaskIds: ["dev-2", "review-2"],
        enqueuedTaskIds: ["dev-2"],
        failures: [],
      };
    });

    await executeTaskLifecycle(
      createPayload(task),
      repositories,
      {
        cli: {
          runtimeType: "cli",
          execute: vi.fn(async () => ({
            ok: true as const,
            output: { loopAction: "repeat" },
          })),
        },
      },
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: () => "run-1",
        progressDownstreamTasksImpl,
        expandLoopIterationImpl,
      },
    );

    expect(expandLoopIterationImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "review-1",
        status: "succeeded",
      }),
      loopDefinition,
      expect.objectContaining({
        workflowId: "workflow-1",
      }),
      repositories,
      expect.any(Object),
      expect.objectContaining({
        now: expect.any(Function),
        randomUUIDImpl: expect.any(Function),
      }),
    );
    expect(progressDownstreamTasksImpl).not.toHaveBeenCalled();
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "running",
    });
  });

  it("allows recursive dynamic spawn across multiple task completions", async () => {
    const task = createTask("task-a", "workflow-1", {
      assigneeAgentId: "agent-1",
    });
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const agent = createAgent("agent-1");
    const { state, repositories } = createRepositories({
      task,
      workflow,
      agent,
    });
    const enqueuePort = createEnqueuePort();
    const registry: ExecutableAdapterRegistry = {
      cli: {
        runtimeType: "cli",
        execute: vi.fn(async (currentTask: Task) => {
          if (currentTask.taskId === "task-a") {
            return {
              ok: true as const,
              output: {
                orchestration: {
                  spawn: {
                    tasks: [
                      {
                        taskKey: "task-b",
                        title: "Task B",
                        payload: {},
                        defaultAssigneeAgentId: "agent-1",
                        retryCount: 0,
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
              },
            };
          }

          if (currentTask.taskId === "task-b") {
            return {
              ok: true as const,
              output: {
                orchestration: {
                  spawn: {
                    tasks: [
                      {
                        taskKey: "task-c",
                        title: "Task C",
                        payload: {},
                        defaultAssigneeAgentId: "agent-1",
                        retryCount: 0,
                      },
                    ],
                    edges: [
                      {
                        from: "task-b",
                        to: "task-c",
                      },
                    ],
                  },
                },
              },
            };
          }

          return {
            ok: true as const,
            output: {},
          };
        }),
      },
    };

    await executeTaskLifecycle(
      createPayload(task),
      repositories,
      registry,
      enqueuePort,
      {
        now: () => "2026-03-15T00:05:00.000Z",
        randomUUIDImpl: vi
          .fn()
          .mockReturnValueOnce("run-1")
          .mockReturnValueOnce("task-b"),
      },
    );

    expect(state.tasks.get("task-b")).toMatchObject({
      status: "queued",
      spawnedFromTaskId: "task-a",
      generationSource: "dynamic",
    });

    await executeTaskLifecycle(
      createPayload(state.tasks.get("task-b")!),
      repositories,
      registry,
      enqueuePort,
      {
        now: () => "2026-03-15T00:10:00.000Z",
        randomUUIDImpl: vi
          .fn()
          .mockReturnValueOnce("run-2")
          .mockReturnValueOnce("task-c"),
      },
    );

    expect(state.tasks.get("task-c")).toMatchObject({
      status: "queued",
      spawnedFromTaskId: "task-b",
      generationSource: "dynamic",
    });

    await executeTaskLifecycle(
      createPayload(state.tasks.get("task-c")!),
      repositories,
      registry,
      enqueuePort,
      {
        now: () => "2026-03-15T00:15:00.000Z",
        randomUUIDImpl: () => "run-3",
      },
    );

    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "succeeded",
    });
  });
});
