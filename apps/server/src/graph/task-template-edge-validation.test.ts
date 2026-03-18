import { describe, expect, it, vi } from "vitest";
import type {
  TaskTemplate,
  TaskTemplateEdge,
  WorkflowDefinition,
} from "@regisseur/core";

import { validateTaskTemplateEdgesForInsert } from "./task-template-edge-validation.js";

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

function createEdge(
  fromTaskTemplateId: string,
  toTaskTemplateId: string,
  overrides: Partial<TaskTemplateEdge> = {},
): TaskTemplateEdge {
  return {
    fromTaskTemplateId,
    toTaskTemplateId,
    type: "depends_on",
    ...overrides,
  };
}

function createRepositories(options: {
  taskTemplates: readonly TaskTemplate[];
  existingEdges?: readonly TaskTemplateEdge[];
}) {
  const taskTemplates = new Map(
    options.taskTemplates.map((taskTemplate) => [
      taskTemplate.taskTemplateId,
      taskTemplate,
    ]),
  );
  const existingEdges = [...(options.existingEdges ?? [])];

  return {
    taskTemplatesRepository: {
      upsert: vi.fn(async () => undefined),
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
      deleteById: vi.fn(async () => undefined),
    },
    taskTemplateEdgesRepository: {
      insert: vi.fn(async () => undefined),
      insertMany: vi.fn(async () => undefined),
      findAllByWorkflowDefinitionTaskTemplates: vi.fn(
        async () => existingEdges,
      ),
      findByFromTaskTemplateId: vi.fn(async () => []),
      findByToTaskTemplateId: vi.fn(async () => []),
      deleteByTaskTemplateId: vi.fn(async () => undefined),
      deleteEdge: vi.fn(async () => undefined),
    },
  };
}

describe("validateTaskTemplateEdgesForInsert", () => {
  it("accepts a valid task template edge insert", async () => {
    const workflowDefinition = createWorkflowDefinition(
      "workflow-definition-1",
    );
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate(
          "task-template-a",
          workflowDefinition.workflowDefinitionId,
        ),
        createTaskTemplate(
          "task-template-b",
          workflowDefinition.workflowDefinitionId,
        ),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [createEdge("task-template-a", "task-template-b")],
        repositories,
      ),
    ).resolves.toEqual([createEdge("task-template-a", "task-template-b")]);
  });

  it("rejects self edges", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [createEdge("task-template-a", "task-template-a")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  });

  it("rejects missing task templates", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [createEdge("task-template-a", "missing-task-template")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  it("rejects cross-definition edges", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-2"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [createEdge("task-template-a", "task-template-b")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CROSS_WORKFLOW_DEFINITION_TASK_TEMPLATE_EDGE",
    });
  });

  it("rejects duplicate existing edges", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-1"),
      ],
      existingEdges: [createEdge("task-template-a", "task-template-b")],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [createEdge("task-template-a", "task-template-b")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "DUPLICATE_TASK_TEMPLATE_EDGE",
    });
  });

  it("rejects duplicate edges in the same request", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-1"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [
          createEdge("task-template-a", "task-template-b"),
          createEdge("task-template-a", "task-template-b"),
        ],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "DUPLICATE_TASK_TEMPLATE_EDGE",
    });
  });

  it("rejects cycles introduced by existing edges", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-1"),
        createTaskTemplate("task-template-c", "workflow-definition-1"),
      ],
      existingEdges: [
        createEdge("task-template-a", "task-template-b"),
        createEdge("task-template-b", "task-template-c"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [createEdge("task-template-c", "task-template-a")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "TASK_TEMPLATE_EDGE_CYCLE",
    });
  });

  it("rejects intra-batch cycles", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-1"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [
          createEdge("task-template-a", "task-template-b"),
          createEdge("task-template-b", "task-template-a"),
        ],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "TASK_TEMPLATE_EDGE_CYCLE",
    });
  });

  it("rejects injectOutput=true without outputMergeKey", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-1"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [
          createEdge("task-template-a", "task-template-b", {
            injectOutput: true,
          }),
        ],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  });

  it("rejects outputMergeKey when injectOutput is disabled", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-1"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [
          createEdge("task-template-a", "task-template-b", {
            outputMergeKey: "result",
          }),
        ],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  });

  it("rejects duplicate outputMergeKey for the same downstream template in the request", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-1"),
        createTaskTemplate("task-template-c", "workflow-definition-1"),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [
          createEdge("task-template-a", "task-template-c", {
            injectOutput: true,
            outputMergeKey: "shared",
          }),
          createEdge("task-template-b", "task-template-c", {
            injectOutput: true,
            outputMergeKey: "shared",
          }),
        ],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  });

  it("rejects duplicate outputMergeKey that collides with an existing injected template edge", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("task-template-a", "workflow-definition-1"),
        createTaskTemplate("task-template-b", "workflow-definition-1"),
        createTaskTemplate("task-template-c", "workflow-definition-1"),
      ],
      existingEdges: [
        createEdge("task-template-a", "task-template-c", {
          injectOutput: true,
          outputMergeKey: "shared",
        }),
      ],
    });

    await expect(
      validateTaskTemplateEdgesForInsert(
        [
          createEdge("task-template-b", "task-template-c", {
            injectOutput: true,
            outputMergeKey: "shared",
          }),
        ],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  });
});
