import { describe, expect, it, vi } from "vitest";
import type { Run, Task, TaskEdge } from "@regisseur/core";

import { injectUpstreamOutputs } from "./inject-upstream-outputs.js";

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
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    ...overrides,
  };
}

function createRun(
  runId: string,
  taskId: string,
  overrides: Partial<Run> = {},
): Run {
  return {
    runId,
    taskId,
    agentId: "agent-1",
    status: "succeeded",
    output: { runId },
    finishedAt: "2026-03-18T00:05:00.000Z",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:05:00.000Z",
    ...overrides,
  };
}

function createEdge(
  fromTaskId: string,
  toTaskId: string,
  overrides: Partial<TaskEdge> = {},
): TaskEdge {
  return {
    fromTaskId,
    toTaskId,
    type: "depends_on",
    ...overrides,
  };
}

describe("injectUpstreamOutputs", () => {
  it("returns the original task when no inject edge exists", async () => {
    const task = createTask("task-b", "workflow-1", {
      payload: { original: true },
    });

    const result = await injectUpstreamOutputs(
      task,
      [createEdge("task-a", "task-b")],
      {
        findLatestSucceededByTaskId: vi.fn(async () => null),
      } as never,
    );

    expect(result).toBe(task);
  });

  it("injects upstream output under the configured merge key", async () => {
    const upstream = createTask("task-a", "workflow-1");
    const task = createTask("task-b", "workflow-1", {
      payload: { original: true },
    });

    const result = await injectUpstreamOutputs(
      task,
      [
        createEdge(upstream.taskId, task.taskId, {
          injectOutput: true,
          outputMergeKey: "result",
        }),
      ],
      {
        findLatestSucceededByTaskId: vi.fn(async () =>
          createRun("run-a", upstream.taskId, {
            output: { summary: "done" },
          }),
        ),
      } as never,
    );

    expect(result).toEqual({
      ...task,
      payload: {
        original: true,
        result: { summary: "done" },
      },
    });
  });

  it("skips injection when the latest succeeded run is missing or has no output", async () => {
    const upstream = createTask("task-a", "workflow-1");
    const task = createTask("task-b", "workflow-1", {
      payload: { original: true },
    });
    const findLatestSucceededByTaskId = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        createRun("run-a", upstream.taskId, { output: undefined }),
      );

    const missingRunResult = await injectUpstreamOutputs(
      task,
      [
        createEdge(upstream.taskId, task.taskId, {
          injectOutput: true,
          outputMergeKey: "result",
        }),
      ],
      {
        findLatestSucceededByTaskId,
      } as never,
    );
    const missingOutputResult = await injectUpstreamOutputs(
      task,
      [
        createEdge(upstream.taskId, task.taskId, {
          injectOutput: true,
          outputMergeKey: "result",
        }),
      ],
      {
        findLatestSucceededByTaskId,
      } as never,
    );

    expect(missingRunResult).toBe(task);
    expect(missingOutputResult).toBe(task);
  });

  it("merges multiple inject edges and allows later duplicates to overwrite", async () => {
    const upstreamA = createTask("task-a", "workflow-1");
    const upstreamB = createTask("task-b", "workflow-1");
    const task = createTask("task-c", "workflow-1", {
      payload: { original: true },
    });

    const result = await injectUpstreamOutputs(
      task,
      [
        createEdge(upstreamA.taskId, task.taskId, {
          injectOutput: true,
          outputMergeKey: "first",
        }),
        createEdge(upstreamA.taskId, task.taskId, {
          injectOutput: true,
          outputMergeKey: "shared",
        }),
        createEdge(upstreamB.taskId, task.taskId, {
          injectOutput: true,
          outputMergeKey: "shared",
        }),
      ],
      {
        findLatestSucceededByTaskId: vi.fn(async (taskId: string) =>
          taskId === upstreamA.taskId
            ? createRun("run-a", upstreamA.taskId, { output: { value: "a" } })
            : createRun("run-b", upstreamB.taskId, { output: { value: "b" } }),
        ),
      } as never,
    );

    expect(result.payload).toEqual({
      original: true,
      first: { value: "a" },
      shared: { value: "b" },
    });
  });
});
