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

function createDependencies() {
  const tasks = new Map<string, Task>();
  const workflows = new Map<string, Workflow>();
  const taskEdges: TaskEdge[] = [];
  const workflowDefinitions = new Map<string, WorkflowDefinition>();
  const taskTemplates = new Map<string, TaskTemplate>();
  const taskTemplateEdges: TaskTemplateEdge[] = [];

  const repositories = {
    agentsRepository: {
      upsert: vi.fn(async () => undefined),
      findAll: vi.fn(async () => [] as AgentDefinition[]),
      findEnabled: vi.fn(async () => [] as AgentDefinition[]),
      findById: vi.fn(async () => null),
      deleteById: vi.fn(async () => undefined),
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
      deleteByTaskId: vi.fn(async () => undefined),
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
        const nextEdges = taskTemplateEdges.filter(
          (edge) =>
            edge.fromTaskTemplateId !== taskTemplateId &&
            edge.toTaskTemplateId !== taskTemplateId,
        );

        taskTemplateEdges.splice(0, taskTemplateEdges.length, ...nextEdges);
      }),
      deleteEdge: vi.fn(
        async (fromTaskTemplateId: string, toTaskTemplateId: string) => {
          const index = taskTemplateEdges.findIndex(
            (edge) =>
              edge.fromTaskTemplateId === fromTaskTemplateId &&
              edge.toTaskTemplateId === toTaskTemplateId &&
              edge.type === "depends_on",
          );

          if (index >= 0) {
            taskTemplateEdges.splice(index, 1);
          }
        },
      ),
    },
    schedulesRepository: {
      upsert: vi.fn(async () => undefined),
      findAll: vi.fn(async () => [] as Schedule[]),
      findEnabled: vi.fn(async () => [] as Schedule[]),
      findByTarget: vi.fn(async () => [] as Schedule[]),
      findById: vi.fn(async () => null),
      deleteById: vi.fn(async () => undefined),
    },
    runsRepository: {
      upsert: vi.fn(async () => undefined),
      findByTaskId: vi.fn(async () => [] as Run[]),
      findByAgentId: vi.fn(async () => [] as Run[]),
      findByStatus: vi.fn(async () => [] as Run[]),
      findById: vi.fn(async () => null),
      deleteById: vi.fn(async () => undefined),
    },
  };

  return {
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
      tasks,
      workflows,
      taskEdges,
    },
    repositories,
  };
}

describe("task edge routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("creates, lists, and deletes task edges through the HTTP API", async () => {
    const ctx = createDependencies();
    ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
    ctx.state.tasks.set("task-a", createTask("task-a", "workflow-1"));
    ctx.state.tasks.set("task-b", createTask("task-b", "workflow-1"));
    app = buildApp(ctx.appDeps);

    const createResponse = await app.inject({
      method: "POST",
      url: "/task-edges",
      payload: {
        fromTaskId: "task-a",
        toTaskId: "task-b",
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toEqual({
      fromTaskId: "task-a",
      toTaskId: "task-b",
      type: "depends_on",
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/workflows/workflow-1/task-edges",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      {
        fromTaskId: "task-a",
        toTaskId: "task-b",
        type: "depends_on",
      },
    ]);

    const dependenciesResponse = await app.inject({
      method: "GET",
      url: "/tasks/task-b/dependencies",
    });
    const dependentsResponse = await app.inject({
      method: "GET",
      url: "/tasks/task-a/dependents",
    });

    expect(dependenciesResponse.statusCode).toBe(200);
    expect(dependentsResponse.statusCode).toBe(200);
    expect(dependenciesResponse.json()).toHaveLength(1);
    expect(dependentsResponse.json()).toHaveLength(1);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/task-edges/task-a/task-b",
    });

    expect(deleteResponse.statusCode).toBe(204);
    expect(ctx.state.taskEdges).toEqual([]);
  });

  it("rejects invalid task edge requests and keeps bulk inserts all-or-nothing", async () => {
    const ctx = createDependencies();
    ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
    ctx.state.tasks.set("task-a", createTask("task-a", "workflow-1"));
    ctx.state.tasks.set("task-b", createTask("task-b", "workflow-1"));
    ctx.state.tasks.set("task-c", createTask("task-c", "workflow-1"));
    app = buildApp(ctx.appDeps);

    const selfEdgeResponse = await app.inject({
      method: "POST",
      url: "/task-edges",
      payload: {
        fromTaskId: "task-a",
        toTaskId: "task-a",
      },
    });

    expect(selfEdgeResponse.statusCode).toBe(400);

    const cycleResponse = await app.inject({
      method: "POST",
      url: "/task-edges/bulk",
      payload: {
        edges: [
          { fromTaskId: "task-a", toTaskId: "task-b" },
          { fromTaskId: "task-b", toTaskId: "task-a" },
        ],
      },
    });

    expect(cycleResponse.statusCode).toBe(409);
    expect(ctx.state.taskEdges).toEqual([]);
  });

  it("rejects cross-workflow edges", async () => {
    const ctx = createDependencies();
    ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
    ctx.state.workflows.set("workflow-2", createWorkflow("workflow-2"));
    ctx.state.tasks.set("task-a", createTask("task-a", "workflow-1"));
    ctx.state.tasks.set("task-b", createTask("task-b", "workflow-2"));
    app = buildApp(ctx.appDeps);

    const response = await app.inject({
      method: "POST",
      url: "/task-edges",
      payload: {
        fromTaskId: "task-a",
        toTaskId: "task-b",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "CROSS_WORKFLOW_TASK_EDGE",
      },
    });
  });
});
