import { describe, expect, it, vi } from "vitest";
import type {
  LoopDefinition,
  TaskTemplate,
  TaskTemplateEdge,
} from "@regisseur/core";

import { validateLoopDefinitionForUpsert } from "./loop-definition-validation.js";

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
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
    ...overrides,
  };
}

function createRepositories(options: {
  taskTemplates: readonly TaskTemplate[];
  taskTemplateEdges?: readonly TaskTemplateEdge[];
  existingLoop?: LoopDefinition | null;
}) {
  const taskTemplates = new Map(
    options.taskTemplates.map((taskTemplate) => [
      taskTemplate.taskTemplateId,
      taskTemplate,
    ]),
  );
  const taskTemplateEdges = [...(options.taskTemplateEdges ?? [])];

  return {
    loopDefinitionsRepository: {
      upsert: vi.fn(async () => undefined),
      findByWorkflowDefinitionId: vi.fn(
        async () => options.existingLoop ?? null,
      ),
      findById: vi.fn(async () => options.existingLoop ?? null),
      deleteById: vi.fn(async () => undefined),
    },
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
  };
}

describe("validateLoopDefinitionForUpsert", () => {
  it("accepts a valid bounded review loop", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("dev-template", "workflow-definition-1"),
        createTaskTemplate("review-template", "workflow-definition-1"),
        createTaskTemplate("deploy-template", "workflow-definition-1"),
      ],
      taskTemplateEdges: [
        createTaskTemplateEdge("dev-template", "review-template"),
        createTaskTemplateEdge("review-template", "deploy-template"),
      ],
    });

    await expect(
      validateLoopDefinitionForUpsert(
        createLoopDefinition("workflow-definition-1"),
        repositories,
      ),
    ).resolves.toMatchObject({
      loopDefinitionId: "loop-1",
      controllerTaskTemplateId: "review-template",
    });
  });

  it("rejects a controller that is not part of the loop body", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("dev-template", "workflow-definition-1"),
        createTaskTemplate("review-template", "workflow-definition-1"),
      ],
    });

    await expect(
      validateLoopDefinitionForUpsert(
        createLoopDefinition("workflow-definition-1", {
          bodyTaskTemplateIds: ["dev-template"],
        }),
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects loop definitions without entry task templates", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("dev-template", "workflow-definition-1"),
        createTaskTemplate("review-template", "workflow-definition-1"),
      ],
    });

    await expect(
      validateLoopDefinitionForUpsert(
        createLoopDefinition("workflow-definition-1", {
          entryTaskTemplateIds: [],
        }),
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects a second loop for the same workflow definition", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("dev-template", "workflow-definition-1"),
        createTaskTemplate("review-template", "workflow-definition-1"),
      ],
      existingLoop: createLoopDefinition("workflow-definition-1", {
        loopDefinitionId: "loop-existing",
      }),
    });

    await expect(
      validateLoopDefinitionForUpsert(
        createLoopDefinition("workflow-definition-1"),
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "LOOP_DEFINITION_ALREADY_EXISTS",
    });
  });

  it("rejects body-to-external downstream edges from non-controller tasks", async () => {
    const repositories = createRepositories({
      taskTemplates: [
        createTaskTemplate("dev-template", "workflow-definition-1"),
        createTaskTemplate("review-template", "workflow-definition-1"),
        createTaskTemplate("notify-template", "workflow-definition-1"),
      ],
      taskTemplateEdges: [
        createTaskTemplateEdge("dev-template", "review-template"),
        createTaskTemplateEdge("dev-template", "notify-template"),
      ],
    });

    await expect(
      validateLoopDefinitionForUpsert(
        createLoopDefinition("workflow-definition-1"),
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_LOOP_EXTERNAL_DOWNSTREAM_EDGE",
    });
  });
});
