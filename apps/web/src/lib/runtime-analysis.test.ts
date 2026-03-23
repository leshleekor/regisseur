import { describe, expect, it } from "vitest";

import type { Run, Task, TaskEdge } from "@regisseur/core";

import {
  collectDownstreamBlockedTasks,
  payloadChanged,
  reconstructInjectedPayload,
} from "./runtime-analysis";

const baseTask: Task = {
  taskId: "task-downstream",
  workflowId: "workflow-1",
  title: "Downstream",
  payload: {
    base: true,
  },
  status: "ready",
  retryCount: 0,
  createdAt: "2026-03-23T00:00:00.000Z",
  updatedAt: "2026-03-23T00:00:00.000Z",
};

describe("reconstructInjectedPayload", () => {
  it("applies latest succeeded upstream output and reports missing sources", () => {
    const preview = reconstructInjectedPayload(
      baseTask,
      [
        {
          fromTaskId: "task-upstream-1",
          toTaskId: "task-downstream",
          type: "depends_on",
          injectOutput: true,
          outputMergeKey: "upstream",
        },
        {
          fromTaskId: "task-upstream-2",
          toTaskId: "task-downstream",
          type: "depends_on",
          injectOutput: true,
          outputMergeKey: "other",
        },
      ] satisfies TaskEdge[],
      new Map<string, Run | undefined>([
        [
          "task-upstream-1",
          {
            runId: "run-1",
            taskId: "task-upstream-1",
            agentId: "agent-1",
            status: "succeeded",
            output: {
              value: 1,
            },
            createdAt: "2026-03-23T00:00:00.000Z",
            updatedAt: "2026-03-23T00:00:00.000Z",
          },
        ],
        ["task-upstream-2", undefined],
      ]),
    );

    expect(preview.payload).toEqual({
      base: true,
      upstream: {
        value: 1,
      },
    });
    expect(preview.applied).toHaveLength(1);
    expect(preview.missing).toEqual([
      {
        fromTaskId: "task-upstream-2",
        reason: "NO_SUCCEEDED_RUN",
      },
    ]);
    expect(payloadChanged(baseTask.payload, preview.payload)).toBe(true);
  });
});

describe("collectDownstreamBlockedTasks", () => {
  it("returns blocked and waiting direct dependents", () => {
    const taskEdges: TaskEdge[] = [
      {
        fromTaskId: "task-failed",
        toTaskId: "task-blocked",
        type: "depends_on",
      },
      {
        fromTaskId: "task-failed",
        toTaskId: "task-running",
        type: "depends_on",
      },
    ];
    const tasks: Task[] = [
      {
        ...baseTask,
        taskId: "task-blocked",
        title: "Blocked",
        status: "blocked",
      },
      {
        ...baseTask,
        taskId: "task-running",
        title: "Running",
        status: "running",
      },
    ];

    const blocked = collectDownstreamBlockedTasks("task-failed", tasks, taskEdges);

    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.task.taskId).toBe("task-blocked");
  });
});
