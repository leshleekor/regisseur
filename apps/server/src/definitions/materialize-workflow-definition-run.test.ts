import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  LoopDefinition,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
} from "@regisseur/core";

import { materializeWorkflowDefinitionRun } from "./materialize-workflow-definition-run.js";

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

function createWorkflowDefinition(
  workflowDefinitionId: string,
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    workflowDefinitionId,
    name: workflowDefinitionId,
    enabled: true,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
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
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
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
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
    ...overrides,
  };
}

function createRepositories(options: {
  workflowDefinitions?: readonly WorkflowDefinition[];
  taskTemplates?: readonly TaskTemplate[];
  taskTemplateEdges?: readonly TaskTemplateEdge[];
  loopDefinitions?: readonly LoopDefinition[];
  agents?: readonly AgentDefinition[];
}) {
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
  const workflows = new Map<string, Workflow>();
  const tasks = new Map<string, Task>();
  const taskEdges: TaskEdge[] = [];

  return {
    state: {
      workflowDefinitions,
      loopDefinitions,
      taskTemplates,
      taskTemplateEdges,
      workflows,
      tasks,
      taskEdges,
    },
    repositories: {
      agentsRepository: {
        upsert: vi.fn(async (agent: AgentDefinition) => {
          agents.set(agent.agentId, agent);
        }),
        findAll: vi.fn(async () => Array.from(agents.values())),
        findEnabled: vi.fn(async () =>
          Array.from(agents.values()).filter((agent) => agent.enabled),
        ),
        findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      workflowsRepository: {
        upsert: vi.fn(async (workflow: Workflow) => {
          workflows.set(workflow.workflowId, workflow);
        }),
        findAll: vi.fn(async () => Array.from(workflows.values())),
        findByStatus: vi.fn(async () => []),
        findById: vi.fn(
          async (workflowId: string) => workflows.get(workflowId) ?? null,
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
        findByStatus: vi.fn(async () => []),
        findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      taskEdgesRepository: {
        insert: vi.fn(async (taskEdge: TaskEdge) => {
          taskEdges.push(taskEdge);
        }),
        insertMany: vi.fn(async (nextTaskEdges: readonly TaskEdge[]) => {
          taskEdges.push(...nextTaskEdges);
        }),
        findAllByWorkflowTasks: vi.fn(async (taskIds: readonly string[]) => {
          const taskIdSet = new Set(taskIds);

          return taskEdges.filter(
            (taskEdge) =>
              taskIdSet.has(taskEdge.fromTaskId) &&
              taskIdSet.has(taskEdge.toTaskId),
          );
        }),
        findByFromTaskId: vi.fn(async () => []),
        findByToTaskId: vi.fn(async () => []),
        deleteByTaskId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
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
        findById: vi.fn(async () => null),
        deleteById: vi.fn(async () => undefined),
      },
      taskTemplateEdgesRepository: {
        insert: vi.fn(async () => undefined),
        insertMany: vi.fn(async () => undefined),
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

describe("materializeWorkflowDefinitionRun", () => {
  it("creates a fresh runtime workflow, tasks, and edges from a workflow definition", async () => {
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
      {
        name: "Feature Delivery",
        metadata: { team: "platform" },
      },
    );
    const analyzeTemplate = createTaskTemplate(
      "task-template-analyze",
      workflowDefinition.workflowDefinitionId,
      {
        title: "Analyze",
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const reviewTemplate = createTaskTemplate(
      "task-template-review",
      workflowDefinition.workflowDefinitionId,
      {
        title: "Review",
      },
    );
    const { repositories, state } = createRepositories({
      workflowDefinitions: [workflowDefinition],
      taskTemplates: [analyzeTemplate, reviewTemplate],
      taskTemplateEdges: [
        createTaskTemplateEdge(
          analyzeTemplate.taskTemplateId,
          reviewTemplate.taskTemplateId,
        ),
      ],
      agents: [createAgent("agent-1")],
    });
    const enqueuePort = {
      enqueueTaskDispatch: vi.fn(async (request) => ({
        ok: true as const,
        jobId: `job-${request.taskId}`,
      })),
    };
    const randomUUIDImpl = vi
      .fn()
      .mockReturnValueOnce("workflow-run-1")
      .mockReturnValueOnce("task-run-1")
      .mockReturnValueOnce("task-run-2");

    const result = await materializeWorkflowDefinitionRun(
      workflowDefinition.workflowDefinitionId,
      repositories,
      enqueuePort,
      {
        triggerSource: "manual",
        requestedAt: "2026-03-16T00:10:00.000Z",
        now: () => "2026-03-16T00:05:00.000Z",
        randomUUIDImpl,
      },
    );

    expect(result.workflow).toMatchObject({
      workflowId: "workflow-run-1",
      workflowDefinitionId: workflowDefinition.workflowDefinitionId,
      name: "Feature Delivery",
      triggerSource: "manual",
      status: "running",
    });
    expect(result.createdTaskIds).toEqual(["task-run-1", "task-run-2"]);
    expect(result.enqueuedTaskIds).toEqual(["task-run-1"]);
    expect(result.tasks).toEqual([
      expect.objectContaining({
        taskId: "task-run-1",
        taskTemplateId: analyzeTemplate.taskTemplateId,
        status: "ready",
      }),
      expect.objectContaining({
        taskId: "task-run-2",
        taskTemplateId: reviewTemplate.taskTemplateId,
        status: "blocked",
      }),
    ]);
    expect(result.taskEdges).toEqual([
      {
        fromTaskId: "task-run-1",
        toTaskId: "task-run-2",
        type: "depends_on",
      },
    ]);
    expect(state.workflows.get("workflow-run-1")).toMatchObject({
      workflowDefinitionId: workflowDefinition.workflowDefinitionId,
      triggerSource: "manual",
      status: "running",
    });
    expect(state.tasks.get("task-run-1")).toMatchObject({
      taskTemplateId: analyzeTemplate.taskTemplateId,
      assigneeAgentId: "agent-1",
      status: "queued",
    });
    expect(state.tasks.get("task-run-2")).toMatchObject({
      taskTemplateId: reviewTemplate.taskTemplateId,
      status: "blocked",
    });
  });

  it("creates a schedule-sourced runtime workflow and stores the triggering schedule id", async () => {
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
    );
    const { repositories } = createRepositories({
      workflowDefinitions: [workflowDefinition],
      taskTemplates: [
        createTaskTemplate(
          "task-template-1",
          workflowDefinition.workflowDefinitionId,
          {
            defaultAssigneeAgentId: "agent-1",
          },
        ),
      ],
      agents: [createAgent("agent-1")],
    });

    const result = await materializeWorkflowDefinitionRun(
      workflowDefinition.workflowDefinitionId,
      repositories,
      {
        enqueueTaskDispatch: vi.fn(async () => ({
          ok: true as const,
          jobId: "job-1",
        })),
      },
      {
        triggerSource: "schedule",
        scheduleId: "schedule-1",
        now: () => "2026-03-16T00:05:00.000Z",
        randomUUIDImpl: vi
          .fn()
          .mockReturnValueOnce("workflow-run-1")
          .mockReturnValueOnce("task-run-1"),
      },
    );

    expect(result.workflow).toMatchObject({
      triggerSource: "schedule",
      triggeredByScheduleId: "schedule-1",
    });
  });

  it("stores loop provenance on iteration 1 materialized body tasks", async () => {
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
    );
    const devTemplate = createTaskTemplate(
      "dev-template",
      workflowDefinition.workflowDefinitionId,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const reviewTemplate = createTaskTemplate(
      "review-template",
      workflowDefinition.workflowDefinitionId,
    );
    const deployTemplate = createTaskTemplate(
      "deploy-template",
      workflowDefinition.workflowDefinitionId,
    );
    const { repositories, state } = createRepositories({
      workflowDefinitions: [workflowDefinition],
      loopDefinitions: [
        createLoopDefinition(workflowDefinition.workflowDefinitionId),
      ],
      taskTemplates: [devTemplate, reviewTemplate, deployTemplate],
      taskTemplateEdges: [
        createTaskTemplateEdge(
          devTemplate.taskTemplateId,
          reviewTemplate.taskTemplateId,
        ),
        createTaskTemplateEdge(
          reviewTemplate.taskTemplateId,
          deployTemplate.taskTemplateId,
        ),
      ],
      agents: [createAgent("agent-1")],
    });

    await materializeWorkflowDefinitionRun(
      workflowDefinition.workflowDefinitionId,
      repositories,
      {
        enqueueTaskDispatch: vi.fn(async () => ({
          ok: true as const,
          jobId: "job-1",
        })),
      },
      {
        triggerSource: "manual",
        now: () => "2026-03-16T00:00:00.000Z",
        randomUUIDImpl: vi
          .fn()
          .mockReturnValueOnce("workflow-runtime-1")
          .mockReturnValueOnce("task-runtime-dev-1")
          .mockReturnValueOnce("task-runtime-review-1")
          .mockReturnValueOnce("task-runtime-deploy-1"),
      },
    );

    expect(state.tasks.get("task-runtime-dev-1")).toMatchObject({
      taskTemplateId: "dev-template",
      loopDefinitionId: "loop-1",
      iteration: 1,
    });
    expect(state.tasks.get("task-runtime-review-1")).toMatchObject({
      taskTemplateId: "review-template",
      loopDefinitionId: "loop-1",
      iteration: 1,
    });
    expect(state.tasks.get("task-runtime-deploy-1")).toMatchObject({
      taskTemplateId: "deploy-template",
    });
    expect(state.tasks.get("task-runtime-deploy-1")).not.toHaveProperty(
      "loopDefinitionId",
    );
  });

  it("fails when the workflow definition is missing", async () => {
    const { repositories } = createRepositories({});

    await expect(
      materializeWorkflowDefinitionRun(
        "missing-definition",
        repositories,
        {
          enqueueTaskDispatch: vi.fn(async () => ({
            ok: true as const,
            jobId: "job-1",
          })),
        },
        {
          triggerSource: "manual",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  it("fails when the workflow definition is disabled", async () => {
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
      {
        enabled: false,
      },
    );
    const { repositories } = createRepositories({
      workflowDefinitions: [workflowDefinition],
    });

    await expect(
      materializeWorkflowDefinitionRun(
        workflowDefinition.workflowDefinitionId,
        repositories,
        {
          enqueueTaskDispatch: vi.fn(async () => ({
            ok: true as const,
            jobId: "job-1",
          })),
        },
        {
          triggerSource: "manual",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_DEFINITION_DISABLED",
    });
  });

  it("fails when the workflow definition has no task templates", async () => {
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
    );
    const { repositories } = createRepositories({
      workflowDefinitions: [workflowDefinition],
    });

    await expect(
      materializeWorkflowDefinitionRun(
        workflowDefinition.workflowDefinitionId,
        repositories,
        {
          enqueueTaskDispatch: vi.fn(async () => ({
            ok: true as const,
            jobId: "job-1",
          })),
        },
        {
          triggerSource: "manual",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "EMPTY_WORKFLOW_DEFINITION",
    });
  });
});
