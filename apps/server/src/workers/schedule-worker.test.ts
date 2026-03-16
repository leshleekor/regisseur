import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  Schedule,
  Task,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
} from "@regisseur/core";

import { createScheduleTriggerProcessor } from "./schedule-worker.js";

function createAgent(): AgentDefinition {
  return {
    agentId: "agent-1",
    name: "agent-1",
    runtimeType: "cli",
    capabilities: [],
    enabled: true,
    config: {},
  };
}

function createSchedule(): Schedule {
  return {
    scheduleId: "schedule-1",
    type: "once",
    runAt: "2026-03-15T01:00:00.000Z",
    enabled: true,
    targetType: "task",
    targetId: "task-1",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
  };
}

function createTask(): Task {
  return {
    taskId: "task-1",
    workflowId: "workflow-1",
    title: "task-1",
    payload: {},
    status: "ready",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
  };
}

function createWorkflow(): Workflow {
  return {
    workflowId: "workflow-1",
    name: "workflow-1",
    status: "pending",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
  };
}

describe("createScheduleTriggerProcessor", () => {
  it("processes a schedule trigger payload through the schedule trigger service", async () => {
    const schedules = new Map([["schedule-1", createSchedule()]]);
    const tasks = new Map([["task-1", createTask()]]);
    const workflows = new Map([["workflow-1", createWorkflow()]]);
    const workflowDefinitions = new Map<string, WorkflowDefinition>();
    const taskTemplates = new Map<string, TaskTemplate>();
    const taskTemplateEdges: TaskTemplateEdge[] = [];
    const processor = createScheduleTriggerProcessor({
      repositories: {
        agentsRepository: {
          upsert: vi.fn(async () => undefined),
          findAll: vi.fn(async () => [createAgent()]),
          findEnabled: vi.fn(async () => [createAgent()]),
          findById: vi.fn(async () => createAgent()),
          deleteById: vi.fn(async () => undefined),
        },
        schedulesRepository: {
          upsert: vi.fn(async (schedule: Schedule) => {
            schedules.set(schedule.scheduleId, schedule);
          }),
          findAll: vi.fn(async () => Array.from(schedules.values())),
          findEnabled: vi.fn(async () => Array.from(schedules.values())),
          findByTarget: vi.fn(async () => []),
          findById: vi.fn(
            async (scheduleId: string) => schedules.get(scheduleId) ?? null,
          ),
          deleteById: vi.fn(async () => undefined),
        },
        tasksRepository: {
          upsert: vi.fn(async (task: Task) => {
            tasks.set(task.taskId, task);
          }),
          findByWorkflowId: vi.fn(async () => Array.from(tasks.values())),
          findByStatus: vi.fn(async () => []),
          findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
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
        workflowsRepository: {
          upsert: vi.fn(async (workflow: Workflow) => {
            workflows.set(workflow.workflowId, workflow);
          }),
          findAll: vi.fn(async () => Array.from(workflows.values())),
          findByStatus: vi.fn(async () => []),
          findById: vi.fn(
            async (workflowId: string) => workflows.get(workflowId) ?? null,
          ),
          deleteById: vi.fn(async () => undefined),
        },
        workflowDefinitionsRepository: {
          upsert: vi.fn(async (workflowDefinition: WorkflowDefinition) => {
            workflowDefinitions.set(
              workflowDefinition.workflowDefinitionId,
              workflowDefinition,
            );
          }),
          findAll: vi.fn(async () => Array.from(workflowDefinitions.values())),
          findEnabled: vi.fn(async () =>
            Array.from(workflowDefinitions.values()).filter(
              (workflowDefinition) => workflowDefinition.enabled,
            ),
          ),
          findById: vi.fn(async () => null),
          deleteById: vi.fn(async () => undefined),
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
          findById: vi.fn(async () => null),
          deleteById: vi.fn(async () => undefined),
        },
        taskTemplateEdgesRepository: {
          insert: vi.fn(async (taskTemplateEdge: TaskTemplateEdge) => {
            taskTemplateEdges.push(taskTemplateEdge);
          }),
          insertMany: vi.fn(
            async (nextTaskTemplateEdges: readonly TaskTemplateEdge[]) => {
              taskTemplateEdges.push(...nextTaskTemplateEdges);
            },
          ),
          findAllByWorkflowDefinitionTaskTemplates: vi.fn(async () => []),
          findByFromTaskTemplateId: vi.fn(async () => []),
          findByToTaskTemplateId: vi.fn(async () => []),
          deleteByTaskTemplateId: vi.fn(async () => undefined),
          deleteEdge: vi.fn(async () => undefined),
        },
      },
      enqueuePort: {
        enqueueTaskDispatch: vi.fn(async () => ({
          ok: true as const,
          jobId: "job-1",
        })),
      },
    });

    await expect(
      processor({
        scheduleId: "schedule-1",
        targetType: "task",
        targetId: "task-1",
        triggeredAt: "2026-03-15T00:30:00.000Z",
      }),
    ).resolves.toBeUndefined();
    expect(tasks.get("task-1")).toMatchObject({
      status: "queued",
      assigneeAgentId: "agent-1",
    });
  });
});
