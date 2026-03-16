import { describe, expect, it, vi } from "vitest";
import type { Task, TaskEdge } from "@regisseur/core";

import { validateTaskEdgesForInsert } from "./task-edge-validation.js";

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

function createRepositories(options: {
  tasks: readonly Task[];
  existingEdges?: readonly TaskEdge[];
}) {
  const tasks = new Map(options.tasks.map((task) => [task.taskId, task]));
  const existingEdges = [...(options.existingEdges ?? [])];

  return {
    tasksRepository: {
      findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
      findByWorkflowId: vi.fn(async (workflowId: string) =>
        Array.from(tasks.values()).filter(
          (task) => task.workflowId === workflowId,
        ),
      ),
      findByStatus: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      deleteById: vi.fn(async () => undefined),
    },
    taskEdgesRepository: {
      insert: vi.fn(async () => undefined),
      insertMany: vi.fn(async () => undefined),
      findAllByWorkflowTasks: vi.fn(async () => existingEdges),
      findByFromTaskId: vi.fn(async () => []),
      findByToTaskId: vi.fn(async () => []),
      deleteByTaskId: vi.fn(async () => undefined),
      deleteEdge: vi.fn(async () => undefined),
    },
  };
}

describe("validateTaskEdgesForInsert", () => {
  it("accepts a valid edge insert", async () => {
    const repositories = createRepositories({
      tasks: [
        createTask("task-a", "workflow-1"),
        createTask("task-b", "workflow-1"),
      ],
    });

    await expect(
      validateTaskEdgesForInsert(
        [createEdge("task-a", "task-b")],
        repositories,
      ),
    ).resolves.toEqual([createEdge("task-a", "task-b")]);
  });

  it("rejects self edges", async () => {
    const repositories = createRepositories({
      tasks: [createTask("task-a", "workflow-1")],
    });

    await expect(
      validateTaskEdgesForInsert(
        [createEdge("task-a", "task-a")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  });

  it("rejects missing tasks", async () => {
    const repositories = createRepositories({
      tasks: [createTask("task-a", "workflow-1")],
    });

    await expect(
      validateTaskEdgesForInsert(
        [createEdge("task-a", "missing-task")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  it("rejects cross-workflow edges", async () => {
    const repositories = createRepositories({
      tasks: [
        createTask("task-a", "workflow-1"),
        createTask("task-b", "workflow-2"),
      ],
    });

    await expect(
      validateTaskEdgesForInsert(
        [createEdge("task-a", "task-b")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CROSS_WORKFLOW_TASK_EDGE",
    });
  });

  it("rejects duplicate existing edges", async () => {
    const repositories = createRepositories({
      tasks: [
        createTask("task-a", "workflow-1"),
        createTask("task-b", "workflow-1"),
      ],
      existingEdges: [createEdge("task-a", "task-b")],
    });

    await expect(
      validateTaskEdgesForInsert(
        [createEdge("task-a", "task-b")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "DUPLICATE_TASK_EDGE",
    });
  });

  it("rejects cycles introduced by existing edges", async () => {
    const repositories = createRepositories({
      tasks: [
        createTask("task-a", "workflow-1"),
        createTask("task-b", "workflow-1"),
        createTask("task-c", "workflow-1"),
      ],
      existingEdges: [
        createEdge("task-a", "task-b"),
        createEdge("task-b", "task-c"),
      ],
    });

    await expect(
      validateTaskEdgesForInsert(
        [createEdge("task-c", "task-a")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "TASK_EDGE_CYCLE",
    });
  });

  it("rejects cycles introduced only inside the bulk request", async () => {
    const repositories = createRepositories({
      tasks: [
        createTask("task-a", "workflow-1"),
        createTask("task-b", "workflow-1"),
      ],
    });

    await expect(
      validateTaskEdgesForInsert(
        [createEdge("task-a", "task-b"), createEdge("task-b", "task-a")],
        repositories,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "TASK_EDGE_CYCLE",
    });
  });
});
