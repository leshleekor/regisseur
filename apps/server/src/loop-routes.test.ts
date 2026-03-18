import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type {
  AgentDefinition,
  LoopDefinition,
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
): WorkflowDefinition {
  return {
    workflowDefinitionId,
    name: workflowDefinitionId,
    enabled: true,
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
  };
}

function createTaskTemplate(
  taskTemplateId: string,
  workflowDefinitionId: string,
): TaskTemplate {
  return {
    taskTemplateId,
    workflowDefinitionId,
    title: taskTemplateId,
    payload: {},
    retryCount: 0,
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
  };
}

function createDependencies() {
  const workflowDefinitions = new Map<string, WorkflowDefinition>();
  const taskTemplates = new Map<string, TaskTemplate>();
  const loopDefinitions = new Map<string, LoopDefinition>();
  const taskTemplateEdges: TaskTemplateEdge[] = [];

  return createServerDependencies(
    {
      agentsRepository: {
        upsert: vi.fn(async () => undefined),
        findAll: vi.fn(async () => [] as AgentDefinition[]),
        findEnabled: vi.fn(async () => [] as AgentDefinition[]),
        findById: vi.fn(async () => null),
        deleteById: vi.fn(async () => undefined),
      },
      workflowsRepository: {
        upsert: vi.fn(async () => undefined),
        findAll: vi.fn(async () => [] as Workflow[]),
        findByStatus: vi.fn(async () => [] as Workflow[]),
        findById: vi.fn(async () => null),
        deleteById: vi.fn(async () => undefined),
      },
      tasksRepository: {
        upsert: vi.fn(async () => undefined),
        findByWorkflowId: vi.fn(async () => [] as Task[]),
        findByStatus: vi.fn(async () => [] as Task[]),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
        findById: vi.fn(async () => null),
        deleteById: vi.fn(async () => undefined),
      },
      taskEdgesRepository: {
        insert: vi.fn(async () => undefined),
        insertMany: vi.fn(async () => undefined),
        findAllByWorkflowTasks: vi.fn(async () => [] as TaskEdge[]),
        findByFromTaskId: vi.fn(async () => [] as TaskEdge[]),
        findByToTaskId: vi.fn(async () => [] as TaskEdge[]),
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
          Array.from(workflowDefinitions.values()),
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
        deleteById: vi.fn(async (loopDefinitionId: string) => {
          loopDefinitions.delete(loopDefinitionId);
        }),
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
        findByFromTaskTemplateId: vi.fn(async () => [] as TaskTemplateEdge[]),
        findByToTaskTemplateId: vi.fn(async () => [] as TaskTemplateEdge[]),
        deleteByTaskTemplateId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
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
        findLatestSucceededByTaskId: vi.fn(async () => null),
        findByAgentId: vi.fn(async () => [] as Run[]),
        findByStatus: vi.fn(async () => [] as Run[]),
        findById: vi.fn(async () => null),
        deleteById: vi.fn(async () => undefined),
      },
    },
    {
      enqueueTaskDispatch: vi.fn(async () => ({
        ok: true as const,
        jobId: "job-1",
      })),
    },
  );
}

describe("loop routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("creates, lists, gets, and deletes loop definitions", async () => {
    const deps = createDependencies();

    await deps.workflowDefinitionsRepository.upsert(
      createWorkflowDefinition("workflow-definition-1"),
    );
    await deps.taskTemplatesRepository.upsert(
      createTaskTemplate("dev-template", "workflow-definition-1"),
    );
    await deps.taskTemplatesRepository.upsert(
      createTaskTemplate("review-template", "workflow-definition-1"),
    );

    app = buildApp(deps);

    const createResponse = await app.inject({
      method: "POST",
      url: "/workflow-definitions/workflow-definition-1/loops",
      payload: {
        loopDefinitionId: "loop-1",
        name: "Review Loop",
        controllerTaskTemplateId: "review-template",
        entryTaskTemplateIds: ["dev-template"],
        bodyTaskTemplateIds: ["dev-template", "review-template"],
        maxIterations: 3,
        createdAt: "2026-03-17T00:00:00.000Z",
        updatedAt: "2026-03-17T00:00:00.000Z",
      },
    });
    const listResponse = await app.inject({
      method: "GET",
      url: "/workflow-definitions/workflow-definition-1/loops",
    });
    const getResponse = await app.inject({
      method: "GET",
      url: "/loops/loop-1",
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/loops/loop-1",
    });

    expect(createResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);
    expect(getResponse.json()).toMatchObject({
      loopDefinitionId: "loop-1",
      controllerTaskTemplateId: "review-template",
    });
    expect(deleteResponse.statusCode).toBe(204);
  });

  it("rejects invalid loop bodies", async () => {
    const deps = createDependencies();

    await deps.workflowDefinitionsRepository.upsert(
      createWorkflowDefinition("workflow-definition-1"),
    );
    await deps.taskTemplatesRepository.upsert(
      createTaskTemplate("dev-template", "workflow-definition-1"),
    );
    await deps.taskTemplatesRepository.upsert(
      createTaskTemplate("review-template", "workflow-definition-1"),
    );

    app = buildApp(deps);

    const response = await app.inject({
      method: "POST",
      url: "/workflow-definitions/workflow-definition-1/loops",
      payload: {
        loopDefinitionId: "loop-1",
        name: "Broken Loop",
        controllerTaskTemplateId: "review-template",
        entryTaskTemplateIds: ["dev-template"],
        bodyTaskTemplateIds: ["dev-template"],
        maxIterations: 3,
        createdAt: "2026-03-17T00:00:00.000Z",
        updatedAt: "2026-03-17T00:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message:
          "controllerTaskTemplateId must be included in bodyTaskTemplateIds",
      },
    });
  });
});
