import { describe, expect, it, vi } from "vitest";
import type { AgentDefinition, Task, Workflow } from "@regisseur/core";

import { selectPersistAndEnqueue } from "./dispatch-persistence.js";

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
    status: "ready",
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

function createStatefulRepositories(task: Task, workflow: Workflow) {
  const tasks = new Map([[task.taskId, task]]);
  const workflows = new Map([[workflow.workflowId, workflow]]);

  return {
    state: {
      tasks,
      workflows,
    },
    repositories: {
      tasksRepository: {
        upsert: vi.fn(async (nextTask: Task) => {
          tasks.set(nextTask.taskId, nextTask);
        }),
        findByWorkflowId: vi.fn(async (workflowId: string) =>
          Array.from(tasks.values()).filter(
            (candidate) => candidate.workflowId === workflowId,
          ),
        ),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
      },
      workflowsRepository: {
        findById: vi.fn(
          async (workflowId: string) => workflows.get(workflowId) ?? null,
        ),
        upsert: vi.fn(async (nextWorkflow: Workflow) => {
          workflows.set(nextWorkflow.workflowId, nextWorkflow);
        }),
      },
    },
  };
}

describe("selectPersistAndEnqueue", () => {
  it("persists task then updates workflow then enqueues", async () => {
    const task = createTask("task-1", "workflow-1");
    const workflow = createWorkflow("workflow-1");
    const callLog: string[] = [];
    const repositories = {
      tasksRepository: {
        upsert: vi.fn(async () => {
          callLog.push("tasks.upsert");
        }),
        findByWorkflowId: vi.fn(async () => []),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
      },
      workflowsRepository: {
        findById: vi.fn(async () => workflow),
        upsert: vi.fn(async () => undefined),
      },
    };
    const enqueuePort = {
      enqueueTaskDispatch: vi.fn(async () => {
        callLog.push("enqueuePort.enqueueTaskDispatch");
        return {
          ok: true as const,
          jobId: "job-1",
        };
      }),
    };
    const updateWorkflowStatusImpl = vi.fn(async () => {
      callLog.push("updateWorkflowStatus");
      return workflow;
    });

    const result = await selectPersistAndEnqueue(
      task,
      [createAgent("agent-1")],
      repositories,
      enqueuePort,
      {
        triggerSource: "manual",
        now: () => "2026-03-15T00:05:00.000Z",
        updateWorkflowStatusImpl,
      },
    );

    expect(result).toEqual({
      ok: true,
      taskId: "task-1",
      workflowId: "workflow-1",
      agentId: "agent-1",
      enqueueResult: {
        ok: true,
        jobId: "job-1",
      },
    });
    expect(callLog).toEqual([
      "tasks.upsert",
      "updateWorkflowStatus",
      "enqueuePort.enqueueTaskDispatch",
    ]);
  });

  it("does not enqueue when task persistence fails", async () => {
    const repositories = {
      tasksRepository: {
        upsert: vi.fn(async () => {
          throw new Error("persist failed");
        }),
        findByWorkflowId: vi.fn(async () => []),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
      },
      workflowsRepository: {
        findById: vi.fn(async () => createWorkflow("workflow-1")),
        upsert: vi.fn(async () => undefined),
      },
    };
    const enqueuePort = {
      enqueueTaskDispatch: vi.fn(async () => ({
        ok: true as const,
        jobId: "job-1",
      })),
    };

    await expect(
      selectPersistAndEnqueue(
        createTask("task-1", "workflow-1"),
        [createAgent("agent-1")],
        repositories,
        enqueuePort,
      ),
    ).rejects.toThrow("persist failed");
    expect(enqueuePort.enqueueTaskDispatch).not.toHaveBeenCalled();
  });

  it("leaves task queued and workflow running when enqueue fails", async () => {
    const task = createTask("task-1", "workflow-1");
    const workflow = createWorkflow("workflow-1");
    const { state, repositories } = createStatefulRepositories(task, workflow);
    const enqueuePort = {
      enqueueTaskDispatch: vi.fn(async () => ({
        ok: false as const,
        message: "queue down",
      })),
    };

    const result = await selectPersistAndEnqueue(
      task,
      [createAgent("agent-1")],
      repositories,
      enqueuePort,
      {
        triggerSource: "manual",
        now: () => "2026-03-15T00:05:00.000Z",
      },
    );

    expect(result).toEqual({
      ok: false,
      taskId: "task-1",
      workflowId: "workflow-1",
      reason: "ENQUEUE_FAILED",
      message: "queue down",
    });
    expect(state.tasks.get("task-1")).toMatchObject({
      status: "queued",
      assigneeAgentId: "agent-1",
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "running",
    });
  });
});
