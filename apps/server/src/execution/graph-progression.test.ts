import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  Task,
  TaskEdge,
  Workflow,
} from "@regisseur/core";

import { progressDownstreamTasks } from "./graph-progression.js";

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

function createWorkflow(
  workflowId: string,
  overrides: Partial<Workflow> = {},
): Workflow {
  return {
    workflowId,
    name: workflowId,
    status: "running",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
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
  workflow: Workflow;
  agents: readonly AgentDefinition[];
  edges: readonly TaskEdge[];
}) {
  const tasks = new Map(options.tasks.map((task) => [task.taskId, task]));
  const workflows = new Map([[options.workflow.workflowId, options.workflow]]);
  const agents = new Map(options.agents.map((agent) => [agent.agentId, agent]));

  return {
    state: {
      tasks,
      workflows,
      agents,
    },
    repositories: {
      agentsRepository: {
        findAll: vi.fn(async () => Array.from(agents.values())),
        findEnabled: vi.fn(async () =>
          Array.from(agents.values()).filter((agent) => agent.enabled),
        ),
        findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
        upsert: vi.fn(async (agent: AgentDefinition) => {
          agents.set(agent.agentId, agent);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      tasksRepository: {
        findByWorkflowId: vi.fn(async (workflowId: string) =>
          Array.from(tasks.values()).filter(
            (task) => task.workflowId === workflowId,
          ),
        ),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
        findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
        findByStatus: vi.fn(async () => []),
        upsert: vi.fn(async (task: Task) => {
          tasks.set(task.taskId, task);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      workflowsRepository: {
        findById: vi.fn(
          async (workflowId: string) => workflows.get(workflowId) ?? null,
        ),
        findAll: vi.fn(async () => Array.from(workflows.values())),
        findByStatus: vi.fn(async () => []),
        upsert: vi.fn(async (workflow: Workflow) => {
          workflows.set(workflow.workflowId, workflow);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      taskEdgesRepository: {
        insert: vi.fn(async () => undefined),
        insertMany: vi.fn(async () => undefined),
        findAllByWorkflowTasks: vi.fn(async () => [...options.edges]),
        findByFromTaskId: vi.fn(async () => []),
        findByToTaskId: vi.fn(async () => []),
        deleteByTaskId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
      },
    },
  };
}

function createEnqueuePort() {
  return {
    enqueueTaskDispatch: vi.fn(async () => ({
      ok: true as const,
      jobId: "job-1",
    })),
  };
}

describe("progressDownstreamTasks", () => {
  it("enqueues the direct downstream task after a success", async () => {
    const workflow = createWorkflow("workflow-1");
    const taskA = createTask("task-a", workflow.workflowId, {
      status: "succeeded",
    });
    const taskB = createTask("task-b", workflow.workflowId, {
      status: "pending",
    });
    const { state, repositories } = createRepositories({
      tasks: [taskA, taskB],
      workflow,
      agents: [createAgent("agent-1")],
      edges: [createEdge(taskA.taskId, taskB.taskId)],
    });

    const result = await progressDownstreamTasks(
      taskA,
      repositories,
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
      },
    );

    expect(result.enqueuedTaskIds).toEqual(["task-b"]);
    expect(state.tasks.get("task-b")).toMatchObject({
      status: "queued",
      assigneeAgentId: "agent-1",
    });
  });

  it("enqueues both branches in a fan-out", async () => {
    const workflow = createWorkflow("workflow-1");
    const taskA = createTask("task-a", workflow.workflowId, {
      status: "succeeded",
    });
    const taskB = createTask("task-b", workflow.workflowId, {
      status: "pending",
    });
    const taskC = createTask("task-c", workflow.workflowId, {
      status: "blocked",
    });
    const { repositories } = createRepositories({
      tasks: [taskA, taskB, taskC],
      workflow,
      agents: [createAgent("agent-1")],
      edges: [
        createEdge(taskA.taskId, taskB.taskId),
        createEdge(taskA.taskId, taskC.taskId),
      ],
    });

    const result = await progressDownstreamTasks(
      taskA,
      repositories,
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
      },
    );

    expect(result.enqueuedTaskIds).toEqual(["task-b", "task-c"]);
  });

  it("does not enqueue a fan-in target until all predecessors succeeded", async () => {
    const workflow = createWorkflow("workflow-1");
    const taskB = createTask("task-b", workflow.workflowId, {
      status: "succeeded",
    });
    const taskC = createTask("task-c", workflow.workflowId, {
      status: "pending",
    });
    const taskD = createTask("task-d", workflow.workflowId, {
      status: "blocked",
    });
    const { repositories } = createRepositories({
      tasks: [taskB, taskC, taskD],
      workflow,
      agents: [createAgent("agent-1")],
      edges: [
        createEdge(taskB.taskId, taskD.taskId),
        createEdge(taskC.taskId, taskD.taskId),
      ],
    });

    const result = await progressDownstreamTasks(
      taskB,
      repositories,
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
      },
    );

    expect(result.enqueuedTaskIds).toEqual([]);
    expect(result.skippedTaskIds).toEqual(["task-d"]);
  });

  it("enqueues a fan-in target only after every predecessor succeeded", async () => {
    const workflow = createWorkflow("workflow-1");
    const taskB = createTask("task-b", workflow.workflowId, {
      status: "succeeded",
    });
    const taskC = createTask("task-c", workflow.workflowId, {
      status: "succeeded",
    });
    const taskD = createTask("task-d", workflow.workflowId, {
      status: "blocked",
    });
    const { state, repositories } = createRepositories({
      tasks: [taskB, taskC, taskD],
      workflow,
      agents: [createAgent("agent-1")],
      edges: [
        createEdge(taskB.taskId, taskD.taskId),
        createEdge(taskC.taskId, taskD.taskId),
      ],
    });

    const result = await progressDownstreamTasks(
      taskC,
      repositories,
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
      },
    );

    expect(result.enqueuedTaskIds).toEqual(["task-d"]);
    expect(state.tasks.get("task-d")).toMatchObject({
      status: "queued",
    });
  });

  it("does not enqueue unrelated root tasks or already active/terminal tasks", async () => {
    const workflow = createWorkflow("workflow-1");
    const taskA = createTask("task-a", workflow.workflowId, {
      status: "succeeded",
    });
    const taskB = createTask("task-b", workflow.workflowId, {
      status: "queued",
    });
    const rootTask = createTask("task-root", workflow.workflowId, {
      status: "pending",
    });
    const { repositories } = createRepositories({
      tasks: [taskA, taskB, rootTask],
      workflow,
      agents: [createAgent("agent-1")],
      edges: [createEdge(taskA.taskId, taskB.taskId)],
    });

    const result = await progressDownstreamTasks(
      taskA,
      repositories,
      createEnqueuePort(),
    );

    expect(result.enqueuedTaskIds).toEqual([]);
    expect(result.skippedTaskIds).toEqual(["task-b"]);
  });

  it("fails only the task with agent selection failure and still enqueues its sibling", async () => {
    const workflow = createWorkflow("workflow-1");
    const taskA = createTask("task-a", workflow.workflowId, {
      status: "succeeded",
    });
    const taskB = createTask("task-b", workflow.workflowId, {
      status: "pending",
      metadata: {
        requiredCapabilities: ["shell"],
      },
    });
    const taskC = createTask("task-c", workflow.workflowId, {
      status: "pending",
    });
    const { state, repositories } = createRepositories({
      tasks: [taskA, taskB, taskC],
      workflow,
      agents: [
        createAgent("agent-1", {
          capabilities: ["http"],
        }),
      ],
      edges: [
        createEdge(taskA.taskId, taskB.taskId),
        createEdge(taskA.taskId, taskC.taskId),
      ],
    });

    const result = await progressDownstreamTasks(
      taskA,
      repositories,
      createEnqueuePort(),
      {
        now: () => "2026-03-15T00:05:00.000Z",
      },
    );

    expect(result.enqueuedTaskIds).toEqual(["task-c"]);
    expect(result.failures).toEqual([
      {
        taskId: "task-b",
        reason: "NO_MATCHING_AGENT",
        message:
          "Task task-b has no enabled agent matching capabilities: shell",
      },
    ]);
    expect(state.tasks.get("task-b")).toMatchObject({
      status: "failed",
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "failed",
    });
    expect(state.tasks.get("task-c")).toMatchObject({
      status: "queued",
    });
  });

  it("does not progress further when the workflow is already failed", async () => {
    const workflow = createWorkflow("workflow-1", { status: "failed" });
    const taskC = createTask("task-c", workflow.workflowId, {
      status: "succeeded",
    });
    const taskD = createTask("task-d", workflow.workflowId, {
      status: "blocked",
    });
    const { repositories } = createRepositories({
      tasks: [taskC, taskD],
      workflow,
      agents: [createAgent("agent-1")],
      edges: [createEdge(taskC.taskId, taskD.taskId)],
    });
    const selectPersistAndEnqueueImpl = vi.fn();

    const result = await progressDownstreamTasks(
      taskC,
      repositories,
      createEnqueuePort(),
      {
        selectPersistAndEnqueueImpl,
      },
    );

    expect(result).toEqual({
      enqueuedTaskIds: [],
      skippedTaskIds: [],
      failures: [],
      skippedBecauseWorkflowFailed: true,
    });
    expect(selectPersistAndEnqueueImpl).not.toHaveBeenCalled();
  });
});
