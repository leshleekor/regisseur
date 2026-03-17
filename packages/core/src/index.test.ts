import { describe, expect, it } from "vitest";

import {
  AGENT_RUNTIME_TYPES,
  DISPATCH_TRIGGER_SOURCES,
  RUNNABLE_TASK_STATUSES,
  RUN_STATUSES,
  SCHEDULE_TARGET_TYPES,
  SCHEDULE_TYPES,
  TASK_EDGE_TYPES,
  TASK_TEMPLATE_EDGE_TYPES,
  TASK_STATUSES,
  TERMINAL_RUN_STATUSES,
  TERMINAL_TASK_STATUSES,
  TERMINAL_WORKFLOW_STATUSES,
  WORKFLOW_STATUSES,
  isRunnableTaskStatus,
  isTerminalRunStatus,
  isTerminalTaskStatus,
  isTerminalWorkflowStatus,
} from "./index.js";
import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  Schedule,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
} from "./index.js";

describe("core domain exports", () => {
  it("allows the core domain models to be consumed from the package entrypoint", () => {
    const agent: AgentDefinition = {
      agentId: "dev-agent-01",
      name: "DEV Agent",
      runtimeType: "cli",
      capabilities: ["implementation", "review"],
      enabled: true,
      config: {
        command: "codex",
      },
    };

    const workflow: Workflow = {
      workflowId: "wf-1",
      name: "Feature Delivery Workflow",
      status: "running",
      workflowDefinitionId: "workflow-definition-1",
      triggerSource: "manual",
      startedAt: "2026-03-12T00:00:00.000Z",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
      metadata: {
        initiatedBy: "manual",
      },
    };

    const workflowDefinition: WorkflowDefinition = {
      workflowDefinitionId: "workflow-definition-1",
      name: "Reusable Feature Delivery Workflow",
      description: "Reusable definition for feature delivery",
      enabled: true,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
      metadata: {
        team: "platform",
      },
    };

    const loopDefinition: LoopDefinition = {
      loopDefinitionId: "loop-1",
      workflowDefinitionId: workflowDefinition.workflowDefinitionId,
      name: "Review Loop",
      controllerTaskTemplateId: "task-template-review",
      entryTaskTemplateIds: ["task-template-1"],
      bodyTaskTemplateIds: ["task-template-1", "task-template-review"],
      maxIterations: 3,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
    };

    const task: Task = {
      taskId: "task-1",
      workflowId: workflow.workflowId,
      title: "Analyze PR changes",
      payload: {
        prNumber: 42,
      },
      status: "ready",
      assigneeAgentId: agent.agentId,
      retryCount: 0,
      taskTemplateId: "task-template-1",
      loopDefinitionId: "loop-1",
      iteration: 1,
      concurrencyKey: "repo:regisseur",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
      metadata: {
        priority: "high",
      },
    };

    const taskTemplate: TaskTemplate = {
      taskTemplateId: "task-template-1",
      workflowDefinitionId: workflowDefinition.workflowDefinitionId,
      title: "Analyze PR changes",
      payload: {
        prNumber: 42,
      },
      retryCount: 0,
      concurrencyKey: "repo:regisseur",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
      metadata: {
        priority: "high",
      },
    };

    const edge: TaskEdge = {
      fromTaskId: "task-0",
      toTaskId: task.taskId,
      type: "depends_on",
    };

    const templateEdge: TaskTemplateEdge = {
      fromTaskTemplateId: "task-template-0",
      toTaskTemplateId: taskTemplate.taskTemplateId,
      type: "depends_on",
    };

    const schedule: Schedule = {
      scheduleId: "schedule-1",
      type: "cron",
      cronExpression: "0 9 * * *",
      timezone: "Asia/Seoul",
      enabled: true,
      targetType: "workflow",
      targetId: workflow.workflowId,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
    };

    const run: Run = {
      runId: "run-1",
      taskId: task.taskId,
      agentId: agent.agentId,
      status: "queued",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
    };

    expect(agent.runtimeType).toBe("cli");
    expect(workflowDefinition.enabled).toBe(true);
    expect(loopDefinition.maxIterations).toBe(3);
    expect(task.status).toBe("ready");
    expect(edge.type).toBe("depends_on");
    expect(taskTemplate.retryCount).toBe(0);
    expect(templateEdge.type).toBe("depends_on");
    expect(schedule.targetType).toBe("workflow");
    expect(run.status).toBe("queued");
    expect(workflow.triggerSource).toBe("manual");
    expect(task.taskTemplateId).toBe(taskTemplate.taskTemplateId);
    expect(task.loopDefinitionId).toBe(loopDefinition.loopDefinitionId);
  });
});

describe("status helpers", () => {
  it("marks only final task statuses as terminal", () => {
    expect(TERMINAL_TASK_STATUSES).toEqual([
      "succeeded",
      "failed",
      "cancelled",
    ]);
    expect(isTerminalTaskStatus("succeeded")).toBe(true);
    expect(isTerminalTaskStatus("failed")).toBe(true);
    expect(isTerminalTaskStatus("cancelled")).toBe(true);
    expect(isTerminalTaskStatus("running")).toBe(false);
    expect(isTerminalTaskStatus("blocked")).toBe(false);
  });

  it("marks only final workflow statuses as terminal", () => {
    expect(TERMINAL_WORKFLOW_STATUSES).toEqual([
      "succeeded",
      "failed",
      "cancelled",
    ]);
    expect(isTerminalWorkflowStatus("succeeded")).toBe(true);
    expect(isTerminalWorkflowStatus("failed")).toBe(true);
    expect(isTerminalWorkflowStatus("cancelled")).toBe(true);
    expect(isTerminalWorkflowStatus("pending")).toBe(false);
    expect(isTerminalWorkflowStatus("running")).toBe(false);
  });

  it("marks only final run statuses as terminal", () => {
    expect(TERMINAL_RUN_STATUSES).toEqual([
      "succeeded",
      "failed",
      "timeout",
      "cancelled",
    ]);
    expect(isTerminalRunStatus("succeeded")).toBe(true);
    expect(isTerminalRunStatus("failed")).toBe(true);
    expect(isTerminalRunStatus("timeout")).toBe(true);
    expect(isTerminalRunStatus("cancelled")).toBe(true);
    expect(isTerminalRunStatus("queued")).toBe(false);
    expect(isTerminalRunStatus("running")).toBe(false);
  });

  it("treats ready as the only runnable task status", () => {
    expect(RUNNABLE_TASK_STATUSES).toEqual(["ready"]);
    expect(isRunnableTaskStatus("ready")).toBe(true);
    expect(isRunnableTaskStatus("pending")).toBe(false);
    expect(isRunnableTaskStatus("queued")).toBe(false);
  });
});

describe("status catalogs", () => {
  it("exports the supported status and type catalogs", () => {
    expect(AGENT_RUNTIME_TYPES).toEqual(["http", "cli", "openclaw"]);
    expect(TASK_STATUSES).toEqual([
      "pending",
      "ready",
      "queued",
      "running",
      "blocked",
      "waiting",
      "succeeded",
      "failed",
      "cancelled",
    ]);
    expect(TASK_EDGE_TYPES).toEqual(["depends_on"]);
    expect(TASK_TEMPLATE_EDGE_TYPES).toEqual(["depends_on"]);
    expect(SCHEDULE_TYPES).toEqual(["once", "cron"]);
    expect(SCHEDULE_TARGET_TYPES).toEqual(["workflow", "task"]);
    expect(DISPATCH_TRIGGER_SOURCES).toEqual([
      "manual",
      "schedule",
      "internal",
    ]);
    expect(WORKFLOW_STATUSES).toEqual([
      "pending",
      "running",
      "succeeded",
      "failed",
      "cancelled",
    ]);
    expect(RUN_STATUSES).toEqual([
      "queued",
      "running",
      "succeeded",
      "failed",
      "timeout",
      "cancelled",
    ]);
  });
});
