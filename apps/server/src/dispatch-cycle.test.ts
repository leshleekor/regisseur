import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
} from "@regisseur/core";

import { buildApp } from "./app.js";
import { createServerDependencies } from "./plugins/repositories.js";
import type {
  RunsRepositoryLike,
  SchedulesRepositoryLike,
  TaskEdgesRepositoryLike,
} from "./types.js";
import { createTaskDispatchProcessor } from "./workers/dispatch-worker.js";

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

function createEdge(fromTaskId: string, toTaskId: string): TaskEdge {
  return {
    fromTaskId,
    toTaskId,
    type: "depends_on",
  };
}

describe("dispatch cycle", () => {
  let app: ReturnType<typeof buildApp> | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("runs route -> enqueue -> worker -> downstream progression end-to-end", async () => {
    const workflow = createWorkflow("workflow-1");
    const taskA = createTask("task-a", workflow.workflowId, {
      status: "ready",
    });
    const taskB = createTask("task-b", workflow.workflowId, {
      status: "pending",
    });
    const agent = createAgent("agent-1");
    const tasks = new Map([
      [taskA.taskId, taskA],
      [taskB.taskId, taskB],
    ]);
    const workflows = new Map([[workflow.workflowId, workflow]]);
    const agents = new Map([[agent.agentId, agent]]);
    const workflowDefinitions = new Map<string, WorkflowDefinition>();
    const loopDefinitions = new Map<string, LoopDefinition>();
    const taskTemplates = new Map<string, TaskTemplate>();
    const taskTemplateEdges: TaskTemplateEdge[] = [];
    const runs = new Map<string, Run>();
    const edges = [createEdge(taskA.taskId, taskB.taskId)];
    const jobs: Array<{
      taskId: string;
      workflowId: string;
      triggerSource: "manual" | "schedule" | "internal";
      requestedAt: string;
    }> = [];

    const agentsRepository = {
      upsert: vi.fn(async (nextAgent: AgentDefinition) => {
        agents.set(nextAgent.agentId, nextAgent);
      }),
      findAll: vi.fn(async () => Array.from(agents.values())),
      findEnabled: vi.fn(async () => Array.from(agents.values())),
      findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
      deleteById: vi.fn(async () => undefined),
    };
    const workflowsRepository = {
      upsert: vi.fn(async (nextWorkflow: Workflow) => {
        workflows.set(nextWorkflow.workflowId, nextWorkflow);
      }),
      findAll: vi.fn(async () => Array.from(workflows.values())),
      findByStatus: vi.fn(async () => []),
      findById: vi.fn(
        async (workflowId: string) => workflows.get(workflowId) ?? null,
      ),
      deleteById: vi.fn(async () => undefined),
    };
    const tasksRepository = {
      upsert: vi.fn(async (nextTask: Task) => {
        tasks.set(nextTask.taskId, nextTask);
      }),
      findByWorkflowId: vi.fn(async (workflowId: string) =>
        Array.from(tasks.values()).filter(
          (task) => task.workflowId === workflowId,
        ),
      ),
      findByStatus: vi.fn(async () => []),
      findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
      deleteById: vi.fn(async () => undefined),
    };
    const taskEdgesRepository: TaskEdgesRepositoryLike = {
      insert: vi.fn(async () => undefined),
      insertMany: vi.fn(async () => undefined),
      findAllByWorkflowTasks: vi.fn(async () => edges),
      findByFromTaskId: vi.fn(async () => []),
      findByToTaskId: vi.fn(async () => []),
      deleteByTaskId: vi.fn(async () => undefined),
      deleteEdge: vi.fn(async () => undefined),
    };
    const workflowDefinitionsRepository = {
      upsert: vi.fn(async (definition: WorkflowDefinition) => {
        workflowDefinitions.set(definition.workflowDefinitionId, definition);
      }),
      findAll: vi.fn(async () => Array.from(workflowDefinitions.values())),
      findEnabled: vi.fn(async () =>
        Array.from(workflowDefinitions.values()).filter(
          (definition) => definition.enabled,
        ),
      ),
      findById: vi.fn(
        async (workflowDefinitionId: string) =>
          workflowDefinitions.get(workflowDefinitionId) ?? null,
      ),
      deleteById: vi.fn(async (workflowDefinitionId: string) => {
        workflowDefinitions.delete(workflowDefinitionId);
      }),
    };
    const loopDefinitionsRepository = {
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
    };
    const taskTemplatesRepository = {
      upsert: vi.fn(async (taskTemplate: TaskTemplate) => {
        taskTemplates.set(taskTemplate.taskTemplateId, taskTemplate);
      }),
      findByWorkflowDefinitionId: vi.fn(async (workflowDefinitionId: string) =>
        Array.from(taskTemplates.values()).filter(
          (taskTemplate) =>
            taskTemplate.workflowDefinitionId === workflowDefinitionId,
        ),
      ),
      findById: vi.fn(
        async (taskTemplateId: string) =>
          taskTemplates.get(taskTemplateId) ?? null,
      ),
      deleteById: vi.fn(async (taskTemplateId: string) => {
        taskTemplates.delete(taskTemplateId);
      }),
    };
    const taskTemplateEdgesRepository = {
      insert: vi.fn(async (edge: TaskTemplateEdge) => {
        taskTemplateEdges.push(edge);
      }),
      insertMany: vi.fn(async (edges: readonly TaskTemplateEdge[]) => {
        taskTemplateEdges.push(...edges);
      }),
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
      findByFromTaskTemplateId: vi.fn(async (taskTemplateId: string) =>
        taskTemplateEdges.filter(
          (edge) => edge.fromTaskTemplateId === taskTemplateId,
        ),
      ),
      findByToTaskTemplateId: vi.fn(async (taskTemplateId: string) =>
        taskTemplateEdges.filter(
          (edge) => edge.toTaskTemplateId === taskTemplateId,
        ),
      ),
      deleteByTaskTemplateId: vi.fn(async () => undefined),
      deleteEdge: vi.fn(async () => undefined),
    };
    const schedulesRepository: SchedulesRepositoryLike = {
      upsert: vi.fn(async () => undefined),
      findAll: vi.fn(async () => []),
      findEnabled: vi.fn(async () => []),
      findByTarget: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      deleteById: vi.fn(async () => undefined),
    };
    const runsRepository: RunsRepositoryLike = {
      upsert: vi.fn(async (run: Run) => {
        runs.set(run.runId, run);
      }),
      findByTaskId: vi.fn(async (taskId: string) =>
        Array.from(runs.values()).filter((run) => run.taskId === taskId),
      ),
      findByAgentId: vi.fn(async (agentId: string) =>
        Array.from(runs.values()).filter((run) => run.agentId === agentId),
      ),
      findByStatus: vi.fn(async () => []),
      findById: vi.fn(async (runId: string) => runs.get(runId) ?? null),
      deleteById: vi.fn(async () => undefined),
    };
    const enqueuePort = {
      enqueueTaskDispatch: vi.fn(async (request) => {
        jobs.push({
          taskId: request.taskId,
          workflowId: request.workflowId,
          triggerSource: request.triggerSource,
          requestedAt: request.requestedAt,
        });

        return {
          ok: true as const,
          jobId: `job-${request.taskId}`,
        };
      }),
    };

    app = buildApp(
      createServerDependencies(
        {
          agentsRepository,
          workflowsRepository,
          tasksRepository,
          taskEdgesRepository,
          workflowDefinitionsRepository,
          loopDefinitionsRepository,
          taskTemplatesRepository,
          taskTemplateEdgesRepository,
          schedulesRepository,
          runsRepository,
        },
        enqueuePort,
        {
          enqueueScheduleTrigger: vi.fn(async () => ({
            jobId: "schedule-job-1",
            jobName: "schedule.trigger",
          })),
          registerCronScheduleTrigger: vi.fn(async () => ({
            jobId: "schedule-job-1",
            jobName: "schedule.trigger",
          })),
        },
      ),
    );

    const response = await app.inject({
      method: "POST",
      url: "/tasks/task-a/dispatch",
    });

    expect(response.statusCode).toBe(200);
    expect(tasks.get("task-a")).toMatchObject({
      status: "queued",
      assigneeAgentId: "agent-1",
    });
    expect(workflows.get("workflow-1")).toMatchObject({
      status: "running",
    });
    expect(jobs).toHaveLength(1);

    const processor = createTaskDispatchProcessor({
      repositories: {
        agentsRepository,
        workflowsRepository,
        tasksRepository,
        taskEdgesRepository,
        workflowDefinitionsRepository,
        loopDefinitionsRepository,
        taskTemplatesRepository,
        taskTemplateEdgesRepository,
        schedulesRepository,
        runsRepository,
      },
      executableAdapterRegistry: {
        cli: {
          runtimeType: "cli",
          execute: vi.fn(async (task) => ({
            ok: true,
            output: {
              completedTaskId: task.taskId,
            },
          })),
        },
      },
      enqueuePort,
      now: () => "2026-03-15T00:05:00.000Z",
      randomUUIDImpl: vi
        .fn()
        .mockReturnValueOnce("run-a")
        .mockReturnValueOnce("run-b"),
    });

    await processor(jobs[0]);

    expect(tasks.get("task-a")).toMatchObject({
      status: "succeeded",
    });
    expect(tasks.get("task-b")).toMatchObject({
      status: "queued",
      assigneeAgentId: "agent-1",
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({
      taskId: "task-b",
      triggerSource: "internal",
    });

    await processor(jobs[1]);

    expect(tasks.get("task-b")).toMatchObject({
      status: "succeeded",
    });
    expect(workflows.get("workflow-1")).toMatchObject({
      status: "succeeded",
    });
    expect(runs.get("run-a")).toMatchObject({
      status: "succeeded",
      output: {
        completedTaskId: "task-a",
      },
    });
    expect(runs.get("run-b")).toMatchObject({
      status: "succeeded",
      output: {
        completedTaskId: "task-b",
      },
    });
  });
});
