import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  Run,
  Task,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
} from "@regisseur/core";

import type { ExecutableAdapterRegistry } from "../types.js";
import { createTaskDispatchProcessor } from "./dispatch-worker.js";

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
    status: "queued",
    assigneeAgentId: "agent-1",
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
    status: "running",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createRepositories(
  task: Task,
  workflow: Workflow,
  agent: AgentDefinition,
) {
  const tasks = new Map([[task.taskId, task]]);
  const workflows = new Map([[workflow.workflowId, workflow]]);
  const agents = new Map([[agent.agentId, agent]]);
  const workflowDefinitions = new Map<string, WorkflowDefinition>();
  const taskTemplates = new Map<string, TaskTemplate>();
  const taskTemplateEdges: TaskTemplateEdge[] = [];
  const runs = new Map<string, Run>();

  return {
    state: {
      tasks,
      workflows,
      runs,
    },
    repositories: {
      agentsRepository: {
        findAll: vi.fn(async () => [agent]),
        findEnabled: vi.fn(async () => [agent]),
        findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
        upsert: vi.fn(async () => undefined),
        deleteById: vi.fn(async () => undefined),
      },
      tasksRepository: {
        findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
        findByWorkflowId: vi.fn(async () => Array.from(tasks.values())),
        findByStatus: vi.fn(async () => []),
        countByWorkflowIdAndGenerationSource: vi.fn(async () => 0),
        upsert: vi.fn(async (nextTask: Task) => {
          tasks.set(nextTask.taskId, nextTask);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      workflowsRepository: {
        findById: vi.fn(
          async (workflowId: string) => workflows.get(workflowId) ?? null,
        ),
        findAll: vi.fn(async () => Array.from(workflows.values())),
        findByStatus: vi.fn(async () => []),
        upsert: vi.fn(async (nextWorkflow: Workflow) => {
          workflows.set(nextWorkflow.workflowId, nextWorkflow);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      runsRepository: {
        findById: vi.fn(async (runId: string) => runs.get(runId) ?? null),
        findByTaskId: vi.fn(async () => Array.from(runs.values())),
        findLatestSucceededByTaskId: vi.fn(
          async (taskId: string) =>
            Array.from(runs.values()).find(
              (run) => run.taskId === taskId && run.status === "succeeded",
            ) ?? null,
        ),
        findByAgentId: vi.fn(async () => Array.from(runs.values())),
        findByStatus: vi.fn(async () => []),
        upsert: vi.fn(async (run: Run) => {
          runs.set(run.runId, run);
        }),
        deleteById: vi.fn(async () => undefined),
      },
      taskEdgesRepository: {
        insert: vi.fn(async () => undefined),
        insertMany: vi.fn(async () => undefined),
        findAllByWorkflowTasks: vi.fn(async () => []),
        findByFromTaskId: vi.fn(async () => []),
        findByToTaskId: vi.fn(async () => []),
        deleteByTaskId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
      },
      workflowDefinitionsRepository: {
        upsert: vi.fn(async (definition: WorkflowDefinition) => {
          workflowDefinitions.set(definition.workflowDefinitionId, definition);
        }),
        findAll: vi.fn(async () => Array.from(workflowDefinitions.values())),
        findEnabled: vi.fn(async () =>
          Array.from(workflowDefinitions.values()).filter(
            (definition) => definition.enabled,
          ),
        ),
        findById: vi.fn(
          async (workflowDefinitionId: string) =>
            workflowDefinitions.get(workflowDefinitionId) ?? null,
        ),
        deleteById: vi.fn(async (workflowDefinitionId: string) => {
          workflowDefinitions.delete(workflowDefinitionId);
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
        deleteById: vi.fn(async (taskTemplateId: string) => {
          taskTemplates.delete(taskTemplateId);
        }),
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
        findByFromTaskTemplateId: vi.fn(async (taskTemplateId: string) =>
          taskTemplateEdges.filter(
            (edge) => edge.fromTaskTemplateId === taskTemplateId,
          ),
        ),
        findByToTaskTemplateId: vi.fn(async (taskTemplateId: string) =>
          taskTemplateEdges.filter(
            (edge) => edge.toTaskTemplateId === taskTemplateId,
          ),
        ),
        deleteByTaskTemplateId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
      },
      schedulesRepository: {
        upsert: vi.fn(async () => undefined),
        findAll: vi.fn(async () => []),
        findEnabled: vi.fn(async () => []),
        findByTarget: vi.fn(async () => []),
        findById: vi.fn(async () => null),
        deleteById: vi.fn(async () => undefined),
      },
    },
  };
}

describe("createTaskDispatchProcessor", () => {
  it("processes a queue payload through the execution lifecycle", async () => {
    const task = createTask("task-1", "workflow-1");
    const workflow = createWorkflow("workflow-1");
    const agent = createAgent("agent-1");
    const { state, repositories } = createRepositories(task, workflow, agent);
    const registry: ExecutableAdapterRegistry = {
      cli: {
        runtimeType: "cli",
        execute: vi.fn(async () => ({
          ok: true,
          output: { result: "ok" },
        })),
      },
    };
    const processor = createTaskDispatchProcessor({
      repositories,
      executableAdapterRegistry: registry,
      enqueuePort: {
        enqueueTaskDispatch: vi.fn(async () => ({
          ok: true as const,
          jobId: "job-1",
        })),
      },
      now: () => "2026-03-15T00:05:00.000Z",
      randomUUIDImpl: () => "run-1",
    });

    await processor({
      taskId: "task-1",
      workflowId: "workflow-1",
      triggerSource: "manual",
      requestedAt: "2026-03-15T00:00:00.000Z",
    });

    expect(state.tasks.get("task-1")).toMatchObject({
      status: "succeeded",
    });
    expect(state.runs.get("run-1")).toMatchObject({
      status: "succeeded",
    });
  });

  it("throws when execution lifecycle returns a failure", async () => {
    const task = createTask("task-1", "workflow-1", {
      assigneeAgentId: undefined,
    });
    const workflow = createWorkflow("workflow-1");
    const agent = createAgent("agent-1");
    const { repositories } = createRepositories(task, workflow, agent);
    const processor = createTaskDispatchProcessor({
      repositories,
      executableAdapterRegistry: {},
      enqueuePort: {
        enqueueTaskDispatch: vi.fn(async () => ({
          ok: true as const,
          jobId: "job-1",
        })),
      },
      now: () => "2026-03-15T00:05:00.000Z",
    });

    await expect(
      processor({
        taskId: "task-1",
        workflowId: "workflow-1",
        triggerSource: "manual",
        requestedAt: "2026-03-15T00:00:00.000Z",
      }),
    ).rejects.toThrow("Task task-1 has no assignee agent id");
  });
});
