import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type {
  AgentDefinition,
  Run,
  Schedule,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
} from "@regisseur/core";

import { buildApp } from "./app.js";
import { createServerDependencies } from "./plugins/repositories.js";

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

function createDependencies() {
  const agents = new Map<string, AgentDefinition>();
  const workflows = new Map<string, Workflow>();
  const tasks = new Map<string, Task>();
  const taskEdges: TaskEdge[] = [];
  const workflowDefinitions = new Map<string, WorkflowDefinition>();
  const taskTemplates = new Map<string, TaskTemplate>();
  let taskTemplateEdges: TaskTemplateEdge[] = [];
  const schedules = new Map<string, Schedule>();
  const runs = new Map<string, Run>();

  const repositories = {
    agentsRepository: {
      upsert: vi.fn(async (agent: AgentDefinition) => {
        agents.set(agent.agentId, agent);
      }),
      findAll: vi.fn(async () => Array.from(agents.values())),
      findEnabled: vi.fn(async () =>
        Array.from(agents.values()).filter((agent) => agent.enabled),
      ),
      findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
      deleteById: vi.fn(async (agentId: string) => {
        agents.delete(agentId);
      }),
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
      deleteById: vi.fn(async (workflowId: string) => {
        workflows.delete(workflowId);
      }),
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
      deleteById: vi.fn(async (taskId: string) => {
        tasks.delete(taskId);
      }),
    },
    taskEdgesRepository: {
      insert: vi.fn(async (edge: TaskEdge) => {
        taskEdges.push(edge);
      }),
      insertMany: vi.fn(async (edges: readonly TaskEdge[]) => {
        taskEdges.push(...edges);
      }),
      findAllByWorkflowTasks: vi.fn(async (taskIds: readonly string[]) => {
        const taskIdSet = new Set(taskIds);

        return taskEdges.filter(
          (edge) =>
            taskIdSet.has(edge.fromTaskId) && taskIdSet.has(edge.toTaskId),
        );
      }),
      findByFromTaskId: vi.fn(async (taskId: string) =>
        taskEdges.filter((edge) => edge.fromTaskId === taskId),
      ),
      findByToTaskId: vi.fn(async (taskId: string) =>
        taskEdges.filter((edge) => edge.toTaskId === taskId),
      ),
      deleteByTaskId: vi.fn(async (taskId: string) => {
        const nextEdges = taskEdges.filter(
          (edge) => edge.fromTaskId !== taskId && edge.toTaskId !== taskId,
        );

        taskEdges.splice(0, taskEdges.length, ...nextEdges);
      }),
      deleteEdge: vi.fn(async (fromTaskId: string, toTaskId: string) => {
        const index = taskEdges.findIndex(
          (edge) =>
            edge.fromTaskId === fromTaskId &&
            edge.toTaskId === toTaskId &&
            edge.type === "depends_on",
        );

        if (index >= 0) {
          taskEdges.splice(index, 1);
        }
      }),
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
      deleteById: vi.fn(async (workflowDefinitionId: string) => {
        workflowDefinitions.delete(workflowDefinitionId);
      }),
    },
    taskTemplatesRepository: {
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
        if (
          taskTemplateEdges.some(
            (edge) =>
              edge.fromTaskTemplateId === taskTemplateId ||
              edge.toTaskTemplateId === taskTemplateId,
          )
        ) {
          const error = new Error("fk violation") as Error & { code: string };

          error.code = "23503";
          throw error;
        }

        taskTemplates.delete(taskTemplateId);
      }),
    },
    taskTemplateEdgesRepository: {
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
      deleteByTaskTemplateId: vi.fn(async (taskTemplateId: string) => {
        taskTemplateEdges = taskTemplateEdges.filter(
          (edge) =>
            edge.fromTaskTemplateId !== taskTemplateId &&
            edge.toTaskTemplateId !== taskTemplateId,
        );
      }),
      deleteEdge: vi.fn(
        async (fromTaskTemplateId: string, toTaskTemplateId: string) => {
          taskTemplateEdges = taskTemplateEdges.filter(
            (edge) =>
              !(
                edge.fromTaskTemplateId === fromTaskTemplateId &&
                edge.toTaskTemplateId === toTaskTemplateId &&
                edge.type === "depends_on"
              ),
          );
        },
      ),
    },
    schedulesRepository: {
      upsert: vi.fn(async (schedule: Schedule) => {
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
      deleteById: vi.fn(async (scheduleId: string) => {
        schedules.delete(scheduleId);
      }),
    },
    runsRepository: {
      upsert: vi.fn(async (run: Run) => {
        runs.set(run.runId, run);
      }),
      findByTaskId: vi.fn(async () => Array.from(runs.values())),
      findByAgentId: vi.fn(async () => Array.from(runs.values())),
      findByStatus: vi.fn(async () => [] as Run[]),
      findById: vi.fn(async (runId: string) => runs.get(runId) ?? null),
      deleteById: vi.fn(async (runId: string) => {
        runs.delete(runId);
      }),
    },
  };

  return {
    repositories,
    appDeps: createServerDependencies(
      repositories,
      {
        enqueueTaskDispatch: vi.fn(async () => ({
          ok: true as const,
          jobId: "job-1",
        })),
      },
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
      false,
    ),
    state: {
      workflowDefinitions,
      taskTemplates,
      workflows,
      tasks,
      taskEdges,
      get taskTemplateEdges() {
        return taskTemplateEdges;
      },
    },
  };
}

describe("definition routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("creates, lists, filters, gets, and deletes workflow definitions", async () => {
    const ctx = createDependencies();
    app = buildApp(ctx.appDeps);

    const definition = createWorkflowDefinition("workflow-definition-1", {
      description: "Reusable workflow",
      enabled: true,
      metadata: { team: "platform" },
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions",
      payload: definition,
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toEqual(definition);

    ctx.state.workflowDefinitions.set(
      "workflow-definition-2",
      createWorkflowDefinition("workflow-definition-2", {
        enabled: false,
      }),
    );

    const listResponse = await app.inject({
      method: "GET",
      url: "/workflow-definitions",
    });
    const enabledResponse = await app.inject({
      method: "GET",
      url: "/workflow-definitions?enabled=true",
    });
    const getResponse = await app.inject({
      method: "GET",
      url: "/workflow-definitions/workflow-definition-1",
    });
    const missingResponse = await app.inject({
      method: "GET",
      url: "/workflow-definitions/missing-definition",
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/workflow-definitions/workflow-definition-1",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(2);
    expect(enabledResponse.statusCode).toBe(200);
    expect(
      enabledResponse
        .json()
        .map(
          (nextDefinition: WorkflowDefinition) =>
            nextDefinition.workflowDefinitionId,
        ),
    ).toEqual(["workflow-definition-1"]);
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(definition);
    expect(missingResponse.statusCode).toBe(404);
    expect(deleteResponse.statusCode).toBe(204);
    expect(ctx.state.workflowDefinitions.has("workflow-definition-1")).toBe(
      false,
    );
  });

  it("creates, lists, gets, and deletes task templates while enforcing definition existence", async () => {
    const ctx = createDependencies();
    ctx.state.workflowDefinitions.set(
      "workflow-definition-1",
      createWorkflowDefinition("workflow-definition-1"),
    );
    app = buildApp(ctx.appDeps);

    const taskTemplate = createTaskTemplate(
      "task-template-1",
      "workflow-definition-1",
      {
        defaultAssigneeAgentId: "agent-1",
        retryCount: 2,
        concurrencyKey: "repo:regisseur",
        metadata: { role: "review" },
      },
    );

    const createResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions/workflow-definition-1/task-templates",
      payload: {
        taskTemplateId: taskTemplate.taskTemplateId,
        title: taskTemplate.title,
        payload: taskTemplate.payload,
        defaultAssigneeAgentId: taskTemplate.defaultAssigneeAgentId,
        retryCount: taskTemplate.retryCount,
        concurrencyKey: taskTemplate.concurrencyKey,
        createdAt: taskTemplate.createdAt,
        updatedAt: taskTemplate.updatedAt,
        metadata: taskTemplate.metadata,
      },
    });
    const missingDefinitionResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions/missing-definition/task-templates",
      payload: {
        taskTemplateId: "task-template-missing",
        title: "missing",
        payload: {},
        retryCount: 0,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
      },
    });
    const listResponse = await app.inject({
      method: "GET",
      url: "/workflow-definitions/workflow-definition-1/task-templates",
    });
    const getResponse = await app.inject({
      method: "GET",
      url: "/task-templates/task-template-1",
    });
    const missingResponse = await app.inject({
      method: "GET",
      url: "/task-templates/missing-task-template",
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/task-templates/task-template-1",
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toEqual(taskTemplate);
    expect(missingDefinitionResponse.statusCode).toBe(404);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([taskTemplate]);
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(taskTemplate);
    expect(missingResponse.statusCode).toBe(404);
    expect(deleteResponse.statusCode).toBe(204);
    expect(ctx.state.taskTemplates.has("task-template-1")).toBe(false);
  });

  it("starts the same workflow definition twice as fresh runtime runs", async () => {
    const ctx = createDependencies();
    ctx.state.workflowDefinitions.set(
      "workflow-definition-1",
      createWorkflowDefinition("workflow-definition-1", {
        name: "Reusable Workflow",
      }),
    );
    ctx.state.taskTemplates.set(
      "task-template-root",
      createTaskTemplate("task-template-root", "workflow-definition-1", {
        title: "Root task",
        defaultAssigneeAgentId: "agent-1",
      }),
    );
    ctx.state.taskTemplates.set(
      "task-template-child",
      createTaskTemplate("task-template-child", "workflow-definition-1", {
        title: "Child task",
      }),
    );
    ctx.state.taskTemplateEdges.push(
      createTaskTemplateEdge("task-template-root", "task-template-child"),
    );

    await ctx.repositories.agentsRepository.upsert(createAgent("agent-1"));
    app = buildApp(ctx.appDeps);

    const firstResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions/workflow-definition-1/start",
    });
    const secondResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions/workflow-definition-1/start",
    });
    const firstBody = firstResponse.json() as {
      workflowId: string;
      workflowDefinitionId: string;
      status: string;
      enqueuedTaskIds: string[];
      createdTaskIds: string[];
    };
    const secondBody = secondResponse.json() as typeof firstBody;

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstBody.workflowDefinitionId).toBe("workflow-definition-1");
    expect(secondBody.workflowDefinitionId).toBe("workflow-definition-1");
    expect(firstBody.workflowId).not.toBe(secondBody.workflowId);
    expect(firstBody.createdTaskIds).toHaveLength(2);
    expect(secondBody.createdTaskIds).toHaveLength(2);
    expect(new Set(firstBody.createdTaskIds)).toHaveLength(2);
    expect(
      firstBody.createdTaskIds.every(
        (taskId) => !secondBody.createdTaskIds.includes(taskId),
      ),
    ).toBe(true);
    expect(firstBody.enqueuedTaskIds).toHaveLength(1);
    expect(secondBody.enqueuedTaskIds).toHaveLength(1);
    expect(ctx.state.workflows.size).toBe(2);
    expect(ctx.state.tasks.size).toBe(4);
    expect(ctx.state.taskEdges).toHaveLength(2);
  });

  it("rejects missing, disabled, and empty workflow definition starts", async () => {
    const ctx = createDependencies();
    ctx.state.workflowDefinitions.set(
      "workflow-definition-disabled",
      createWorkflowDefinition("workflow-definition-disabled", {
        enabled: false,
      }),
    );
    ctx.state.workflowDefinitions.set(
      "workflow-definition-empty",
      createWorkflowDefinition("workflow-definition-empty"),
    );
    app = buildApp(ctx.appDeps);

    const missingResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions/missing-definition/start",
    });
    const disabledResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions/workflow-definition-disabled/start",
    });
    const emptyResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions/workflow-definition-empty/start",
    });

    expect(missingResponse.statusCode).toBe(404);
    expect(disabledResponse.statusCode).toBe(409);
    expect(disabledResponse.json()).toMatchObject({
      error: {
        code: "WORKFLOW_DEFINITION_DISABLED",
      },
    });
    expect(emptyResponse.statusCode).toBe(409);
    expect(emptyResponse.json()).toMatchObject({
      error: {
        code: "EMPTY_WORKFLOW_DEFINITION",
      },
    });
  });

  it("returns 409 when deleting a task template that still has template edges", async () => {
    const ctx = createDependencies();
    ctx.state.workflowDefinitions.set(
      "workflow-definition-1",
      createWorkflowDefinition("workflow-definition-1"),
    );
    ctx.state.taskTemplates.set(
      "task-template-a",
      createTaskTemplate("task-template-a", "workflow-definition-1"),
    );
    ctx.state.taskTemplates.set(
      "task-template-b",
      createTaskTemplate("task-template-b", "workflow-definition-1"),
    );
    ctx.state.taskTemplateEdges.push(
      createTaskTemplateEdge("task-template-a", "task-template-b"),
    );
    app = buildApp(ctx.appDeps);

    const response = await app.inject({
      method: "DELETE",
      url: "/task-templates/task-template-a",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "CONFLICT",
      },
    });
  });

  it("creates, lists, rejects invalid task template edges, and deletes exact edges", async () => {
    const ctx = createDependencies();
    ctx.state.workflowDefinitions.set(
      "workflow-definition-1",
      createWorkflowDefinition("workflow-definition-1"),
    );
    ctx.state.workflowDefinitions.set(
      "workflow-definition-2",
      createWorkflowDefinition("workflow-definition-2"),
    );
    ctx.state.taskTemplates.set(
      "task-template-a",
      createTaskTemplate("task-template-a", "workflow-definition-1"),
    );
    ctx.state.taskTemplates.set(
      "task-template-b",
      createTaskTemplate("task-template-b", "workflow-definition-1"),
    );
    ctx.state.taskTemplates.set(
      "task-template-c",
      createTaskTemplate("task-template-c", "workflow-definition-1"),
    );
    ctx.state.taskTemplates.set(
      "task-template-x",
      createTaskTemplate("task-template-x", "workflow-definition-2"),
    );
    app = buildApp(ctx.appDeps);

    const createResponse = await app.inject({
      method: "POST",
      url: "/task-template-edges",
      payload: {
        fromTaskTemplateId: "task-template-a",
        toTaskTemplateId: "task-template-b",
      },
    });
    const bulkResponse = await app.inject({
      method: "POST",
      url: "/task-template-edges/bulk",
      payload: {
        edges: [
          {
            fromTaskTemplateId: "task-template-b",
            toTaskTemplateId: "task-template-c",
          },
        ],
      },
    });
    const listResponse = await app.inject({
      method: "GET",
      url: "/workflow-definitions/workflow-definition-1/task-template-edges",
    });
    const dependenciesResponse = await app.inject({
      method: "GET",
      url: "/task-templates/task-template-b/dependencies",
    });
    const dependentsResponse = await app.inject({
      method: "GET",
      url: "/task-templates/task-template-b/dependents",
    });
    const selfEdgeResponse = await app.inject({
      method: "POST",
      url: "/task-template-edges",
      payload: {
        fromTaskTemplateId: "task-template-a",
        toTaskTemplateId: "task-template-a",
      },
    });
    const crossDefinitionResponse = await app.inject({
      method: "POST",
      url: "/task-template-edges",
      payload: {
        fromTaskTemplateId: "task-template-a",
        toTaskTemplateId: "task-template-x",
      },
    });
    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/task-template-edges",
      payload: {
        fromTaskTemplateId: "task-template-a",
        toTaskTemplateId: "task-template-b",
      },
    });
    const cycleResponse = await app.inject({
      method: "POST",
      url: "/task-template-edges/bulk",
      payload: {
        edges: [
          {
            fromTaskTemplateId: "task-template-c",
            toTaskTemplateId: "task-template-a",
          },
        ],
      },
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/task-template-edges/task-template-a/task-template-b",
    });

    expect(createResponse.statusCode).toBe(200);
    expect(bulkResponse.statusCode).toBe(200);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      createTaskTemplateEdge("task-template-a", "task-template-b"),
      createTaskTemplateEdge("task-template-b", "task-template-c"),
    ]);
    expect(dependenciesResponse.statusCode).toBe(200);
    expect(dependenciesResponse.json()).toEqual([
      createTaskTemplateEdge("task-template-a", "task-template-b"),
    ]);
    expect(dependentsResponse.statusCode).toBe(200);
    expect(dependentsResponse.json()).toEqual([
      createTaskTemplateEdge("task-template-b", "task-template-c"),
    ]);
    expect(selfEdgeResponse.statusCode).toBe(400);
    expect(crossDefinitionResponse.statusCode).toBe(409);
    expect(duplicateResponse.statusCode).toBe(409);
    expect(cycleResponse.statusCode).toBe(409);
    expect(deleteResponse.statusCode).toBe(204);
    expect(ctx.state.taskTemplateEdges).toEqual([
      createTaskTemplateEdge("task-template-b", "task-template-c"),
    ]);
  });
});
