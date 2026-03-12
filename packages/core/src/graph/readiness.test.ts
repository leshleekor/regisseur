import { describe, expect, it } from "vitest";

import {
  canTaskBecomeReady,
  evaluateTaskReadiness,
  getDependencyTaskIds,
  getDependentTaskIds,
  getReadyTaskIds,
} from "../index.js";
import type { Task, TaskEdge, TaskStatus } from "../index.js";

const WORKFLOW_ID = "workflow-1";

function createTask(
  taskId: string,
  status: TaskStatus,
  overrides: Partial<Task> = {},
): Task {
  return {
    taskId,
    workflowId: WORKFLOW_ID,
    title: taskId,
    payload: {},
    status,
    retryCount: 0,
    createdAt: "2026-03-13T00:00:00.000Z",
    updatedAt: "2026-03-13T00:00:00.000Z",
    ...overrides,
  };
}

function createDependencyEdge(fromTaskId: string, toTaskId: string): TaskEdge {
  return {
    fromTaskId,
    toTaskId,
    type: "depends_on",
  };
}

describe("task graph dependency helpers", () => {
  it("returns empty dependencies for root tasks and deduplicates dependency ids", () => {
    const edges = [
      createDependencyEdge("task-a", "task-c"),
      createDependencyEdge("task-b", "task-c"),
      createDependencyEdge("task-a", "task-c"),
    ];

    expect(getDependencyTaskIds("task-a", edges)).toEqual([]);
    expect(getDependencyTaskIds("task-c", edges)).toEqual(["task-a", "task-b"]);
  });

  it("returns unique dependent task ids for fan-out edges", () => {
    const edges = [
      createDependencyEdge("task-a", "task-b"),
      createDependencyEdge("task-a", "task-c"),
      createDependencyEdge("task-a", "task-c"),
    ];

    expect(getDependentTaskIds("task-a", edges)).toEqual(["task-b", "task-c"]);
    expect(getDependentTaskIds("task-b", edges)).toEqual([]);
  });
});

describe("task graph readiness evaluator", () => {
  it("makes fan-out dependents ready once their shared prerequisite succeeds", () => {
    const tasks = [
      createTask("task-a", "succeeded"),
      createTask("task-b", "pending"),
      createTask("task-c", "blocked"),
    ];
    const edges = [
      createDependencyEdge("task-a", "task-b"),
      createDependencyEdge("task-a", "task-c"),
    ];

    expect(getReadyTaskIds(tasks, edges)).toEqual(["task-b", "task-c"]);
    expect(canTaskBecomeReady(tasks[1], tasks, edges)).toBe(true);
    expect(canTaskBecomeReady(tasks[2], tasks, edges)).toBe(true);
  });

  it("requires all fan-in dependencies to succeed before a task becomes ready", () => {
    const blockedTasks = [
      createTask("task-b", "succeeded"),
      createTask("task-c", "pending"),
      createTask("task-d", "blocked"),
    ];
    const edges = [
      createDependencyEdge("task-b", "task-d"),
      createDependencyEdge("task-c", "task-d"),
    ];

    expect(getReadyTaskIds(blockedTasks, edges)).toEqual(["task-c"]);
    expect(canTaskBecomeReady(blockedTasks[2], blockedTasks, edges)).toBe(
      false,
    );

    const readyTasks = [
      createTask("task-b", "succeeded"),
      createTask("task-c", "succeeded"),
      createTask("task-d", "blocked"),
    ];

    expect(getReadyTaskIds(readyTasks, edges)).toEqual(["task-d"]);
    expect(canTaskBecomeReady(readyTasks[2], readyTasks, edges)).toBe(true);
  });

  it("never treats terminal tasks as ready", () => {
    const tasks = [
      createTask("task-succeeded", "succeeded"),
      createTask("task-failed", "failed"),
      createTask("task-cancelled", "cancelled"),
    ];

    expect(getReadyTaskIds(tasks, [])).toEqual([]);
    expect(canTaskBecomeReady(tasks[0], tasks, [])).toBe(false);
    expect(canTaskBecomeReady(tasks[1], tasks, [])).toBe(false);
    expect(canTaskBecomeReady(tasks[2], tasks, [])).toBe(false);
  });

  it("does not automatically ready queued or running tasks", () => {
    const tasks = [
      createTask("task-queued", "queued"),
      createTask("task-running", "running"),
    ];

    expect(getReadyTaskIds(tasks, [])).toEqual([]);
    expect(canTaskBecomeReady(tasks[0], tasks, [])).toBe(false);
    expect(canTaskBecomeReady(tasks[1], tasks, [])).toBe(false);
  });

  it("does not automatically ready waiting tasks even when dependencies are satisfied", () => {
    const tasks = [
      createTask("task-a", "succeeded"),
      createTask("task-b", "waiting"),
    ];
    const edges = [createDependencyEdge("task-a", "task-b")];

    expect(getReadyTaskIds(tasks, edges)).toEqual([]);
    expect(canTaskBecomeReady(tasks[1], tasks, edges)).toBe(false);
  });

  it("makes dependency-free pending root tasks ready", () => {
    const tasks = [createTask("task-root", "pending")];

    expect(getReadyTaskIds(tasks, [])).toEqual(["task-root"]);
    expect(canTaskBecomeReady(tasks[0], tasks, [])).toBe(true);
    expect(evaluateTaskReadiness(tasks[0], tasks, [])).toMatchObject({
      taskId: "task-root",
      dependencyTaskIds: [],
      blockedByTaskIds: [],
      missingDependencyTaskIds: [],
      canBecomeReady: true,
      isReady: true,
    });
  });

  it("treats missing dependency ids as unsatisfied prerequisites", () => {
    const tasks = [createTask("task-b", "pending")];
    const edges = [createDependencyEdge("missing-task", "task-b")];

    expect(getReadyTaskIds(tasks, edges)).toEqual([]);
    expect(canTaskBecomeReady(tasks[0], tasks, edges)).toBe(false);
    expect(evaluateTaskReadiness(tasks[0], tasks, edges)).toMatchObject({
      dependencyTaskIds: ["missing-task"],
      missingDependencyTaskIds: ["missing-task"],
      blockedByTaskIds: ["missing-task"],
      canBecomeReady: false,
      isReady: false,
    });
  });

  it("re-evaluates blocked tasks as ready once dependencies are satisfied", () => {
    const tasks = [
      createTask("task-a", "succeeded"),
      createTask("task-b", "blocked"),
    ];
    const edges = [createDependencyEdge("task-a", "task-b")];

    expect(getReadyTaskIds(tasks, edges)).toEqual(["task-b"]);
    expect(canTaskBecomeReady(tasks[1], tasks, edges)).toBe(true);
  });
});
