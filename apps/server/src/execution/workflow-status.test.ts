import { describe, expect, it, vi } from "vitest";
import type { Task, Workflow } from "@regisseur/core";

import {
  deriveWorkflowStatus,
  updateWorkflowStatus,
} from "./workflow-status.js";

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

describe("deriveWorkflowStatus", () => {
  it("returns pending when all tasks are pending or ready", () => {
    expect(
      deriveWorkflowStatus([
        createTask("task-1", "workflow-1", { status: "pending" }),
        createTask("task-2", "workflow-1", { status: "ready" }),
      ]),
    ).toBe("pending");
  });

  it("returns running when any task is queued or running", () => {
    expect(
      deriveWorkflowStatus([
        createTask("task-1", "workflow-1", { status: "queued" }),
        createTask("task-2", "workflow-1", { status: "ready" }),
      ]),
    ).toBe("running");
  });

  it("returns failed when any task is failed", () => {
    expect(
      deriveWorkflowStatus([
        createTask("task-1", "workflow-1", { status: "failed" }),
        createTask("task-2", "workflow-1", { status: "queued" }),
      ]),
    ).toBe("failed");
  });

  it("keeps failed above running when both are present", () => {
    expect(
      deriveWorkflowStatus([
        createTask("task-1", "workflow-1", { status: "running" }),
        createTask("task-2", "workflow-1", { status: "failed" }),
      ]),
    ).toBe("failed");
  });

  it("returns succeeded when every task succeeded", () => {
    expect(
      deriveWorkflowStatus([
        createTask("task-1", "workflow-1", { status: "succeeded" }),
        createTask("task-2", "workflow-1", { status: "succeeded" }),
      ]),
    ).toBe("succeeded");
  });
});

describe("updateWorkflowStatus", () => {
  it("persists an updated workflow status when the aggregate changes", async () => {
    const workflow = createWorkflow("workflow-1");
    const tasks = [
      createTask("task-1", "workflow-1", { status: "queued" }),
      createTask("task-2", "workflow-1", { status: "pending" }),
    ];
    const repositories = {
      workflowsRepository: {
        findById: vi.fn(async () => workflow),
        upsert: vi.fn(async () => undefined),
      },
      tasksRepository: {
        findByWorkflowId: vi.fn(async () => tasks),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
      },
    };

    const updatedWorkflow = await updateWorkflowStatus(
      workflow.workflowId,
      repositories,
      "2026-03-15T00:05:00.000Z",
    );

    expect(updatedWorkflow).toEqual({
      ...workflow,
      status: "running",
      updatedAt: "2026-03-15T00:05:00.000Z",
    });
    expect(repositories.workflowsRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "workflow-1",
        status: "running",
      }),
    );
  });

  it("skips persistence when the workflow status is already current", async () => {
    const workflow = createWorkflow("workflow-1", { status: "running" });
    const repositories = {
      workflowsRepository: {
        findById: vi.fn(async () => workflow),
        upsert: vi.fn(async () => undefined),
      },
      tasksRepository: {
        findByWorkflowId: vi.fn(async () => [
          createTask("task-1", "workflow-1", { status: "running" }),
        ]),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
      },
    };

    const updatedWorkflow = await updateWorkflowStatus(
      workflow.workflowId,
      repositories,
      "2026-03-15T00:05:00.000Z",
    );

    expect(updatedWorkflow).toBe(workflow);
    expect(repositories.workflowsRepository.upsert).not.toHaveBeenCalled();
  });

  it("preserves failed workflow status as terminal even when task aggregate is non-failed", async () => {
    const workflow = createWorkflow("workflow-1", { status: "failed" });
    const repositories = {
      workflowsRepository: {
        findById: vi.fn(async () => workflow),
        upsert: vi.fn(async () => undefined),
      },
      tasksRepository: {
        findByWorkflowId: vi.fn(async () => [
          createTask("task-1", "workflow-1", { status: "succeeded" }),
          createTask("task-2", "workflow-1", { status: "blocked" }),
        ]),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
      },
    };

    const updatedWorkflow = await updateWorkflowStatus(
      workflow.workflowId,
      repositories,
      "2026-03-15T00:05:00.000Z",
    );

    expect(updatedWorkflow).toBe(workflow);
    expect(repositories.workflowsRepository.upsert).not.toHaveBeenCalled();
  });
});
