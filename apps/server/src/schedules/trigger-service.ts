import { type AgentDefinition, type Schedule } from "@regisseur/core";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";
import type { ScheduleTriggerJobPayload } from "@regisseur/queue-bullmq";

import { materializeWorkflowDefinitionRun } from "../definitions/materialize-workflow-definition-run.js";
import {
  selectPersistAndEnqueue,
  type SelectPersistAndEnqueueResult,
} from "../execution/dispatch-persistence.js";
import type {
  AgentsRepositoryLike,
  LoopDefinitionsRepositoryLike,
  SchedulesRepositoryLike,
  TaskEdgesRepositoryLike,
  TaskTemplateEdgesRepositoryLike,
  TaskTemplatesRepositoryLike,
  TasksRepositoryLike,
  WorkflowDefinitionsRepositoryLike,
  WorkflowsRepositoryLike,
} from "../types.js";

export interface ScheduleTriggerRepositories {
  agentsRepository: AgentsRepositoryLike;
  schedulesRepository: SchedulesRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
  workflowDefinitionsRepository: WorkflowDefinitionsRepositoryLike;
  taskTemplatesRepository: TaskTemplatesRepositoryLike;
  taskTemplateEdgesRepository: TaskTemplateEdgesRepositoryLike;
  loopDefinitionsRepository: LoopDefinitionsRepositoryLike;
}

export interface HandleScheduleTriggerResult {
  scheduleId: string;
  enqueuedTaskIds: string[];
  skipped: boolean;
  skippedReason?:
    | "SCHEDULE_NOT_FOUND"
    | "SCHEDULE_DISABLED"
    | "TASK_NOT_FOUND"
    | "TASK_NOT_READY"
    | "DEFINITION_NOT_FOUND"
    | "DEFINITION_DISABLED";
}

export interface HandleScheduleTriggerOptions {
  now?: () => string;
  selectPersistAndEnqueueImpl?: typeof selectPersistAndEnqueue;
  materializeWorkflowDefinitionRunImpl?: typeof materializeWorkflowDefinitionRun;
  logError?: (message: string, error: unknown) => void;
}

function createSkippedResult(
  scheduleId: string,
  skippedReason: NonNullable<HandleScheduleTriggerResult["skippedReason"]>,
): HandleScheduleTriggerResult {
  return {
    scheduleId,
    enqueuedTaskIds: [],
    skipped: true,
    skippedReason,
  };
}

async function getAllAgents(
  repositories: ScheduleTriggerRepositories,
): Promise<readonly AgentDefinition[]> {
  return repositories.agentsRepository.findAll();
}

function assertEnqueueDidNotFail(
  result: SelectPersistAndEnqueueResult,
): SelectPersistAndEnqueueResult {
  if (!result.ok && result.reason === "ENQUEUE_FAILED") {
    throw new Error(result.message);
  }

  return result;
}

async function triggerScheduledTask(
  schedule: Schedule,
  payload: ScheduleTriggerJobPayload,
  repositories: ScheduleTriggerRepositories,
  enqueuePort: DispatchEnqueuePort,
  options: HandleScheduleTriggerOptions,
): Promise<HandleScheduleTriggerResult> {
  const task = await repositories.tasksRepository.findById(schedule.targetId);

  if (!task) {
    return createSkippedResult(schedule.scheduleId, "TASK_NOT_FOUND");
  }

  if (task.status !== "ready") {
    return createSkippedResult(schedule.scheduleId, "TASK_NOT_READY");
  }

  const allAgents = await getAllAgents(repositories);
  const result = assertEnqueueDidNotFail(
    await (options.selectPersistAndEnqueueImpl ?? selectPersistAndEnqueue)(
      task,
      allAgents,
      {
        tasksRepository: repositories.tasksRepository,
        workflowsRepository: repositories.workflowsRepository,
      },
      enqueuePort,
      {
        triggerSource: "schedule",
        requestedAt: payload.triggeredAt,
        selectionFailureMode: "fail_task",
        now: options.now,
      },
    ),
  );

  return {
    scheduleId: schedule.scheduleId,
    enqueuedTaskIds: result.ok ? [result.taskId] : [],
    skipped: !result.ok,
  };
}

async function triggerScheduledWorkflow(
  schedule: Schedule,
  payload: ScheduleTriggerJobPayload,
  repositories: ScheduleTriggerRepositories,
  enqueuePort: DispatchEnqueuePort,
  options: HandleScheduleTriggerOptions,
): Promise<HandleScheduleTriggerResult> {
  const workflowDefinition =
    await repositories.workflowDefinitionsRepository.findById(
      schedule.targetId,
    );

  if (!workflowDefinition) {
    return createSkippedResult(schedule.scheduleId, "DEFINITION_NOT_FOUND");
  }

  if (!workflowDefinition.enabled) {
    return createSkippedResult(schedule.scheduleId, "DEFINITION_DISABLED");
  }

  const result = await (
    options.materializeWorkflowDefinitionRunImpl ??
    materializeWorkflowDefinitionRun
  )(
    schedule.targetId,
    {
      agentsRepository: repositories.agentsRepository,
      workflowsRepository: repositories.workflowsRepository,
      tasksRepository: repositories.tasksRepository,
      taskEdgesRepository: repositories.taskEdgesRepository,
      workflowDefinitionsRepository: repositories.workflowDefinitionsRepository,
      taskTemplatesRepository: repositories.taskTemplatesRepository,
      taskTemplateEdgesRepository: repositories.taskTemplateEdgesRepository,
      loopDefinitionsRepository: repositories.loopDefinitionsRepository,
    },
    enqueuePort,
    {
      triggerSource: "schedule",
      scheduleId: schedule.scheduleId,
      requestedAt: payload.triggeredAt,
      now: options.now,
      selectPersistAndEnqueueImpl: options.selectPersistAndEnqueueImpl,
    },
  );

  return {
    scheduleId: schedule.scheduleId,
    enqueuedTaskIds: result.enqueuedTaskIds,
    skipped: false,
  };
}

async function disableOnceScheduleAfterHandling(
  schedule: Schedule,
  repositories: ScheduleTriggerRepositories,
  options: HandleScheduleTriggerOptions,
): Promise<void> {
  if (schedule.type !== "once") {
    return;
  }

  try {
    await repositories.schedulesRepository.upsert({
      ...schedule,
      enabled: false,
      updatedAt: options.now?.() ?? new Date().toISOString(),
    });
  } catch (error) {
    options.logError?.(
      `Failed to disable once schedule ${schedule.scheduleId} after handling`,
      error,
    );
  }
}

export async function handleScheduleTrigger(
  payload: ScheduleTriggerJobPayload,
  repositories: ScheduleTriggerRepositories,
  enqueuePort: DispatchEnqueuePort,
  options: HandleScheduleTriggerOptions = {},
): Promise<HandleScheduleTriggerResult> {
  const schedule = await repositories.schedulesRepository.findById(
    payload.scheduleId,
  );

  if (!schedule) {
    return createSkippedResult(payload.scheduleId, "SCHEDULE_NOT_FOUND");
  }

  if (!schedule.enabled) {
    return createSkippedResult(schedule.scheduleId, "SCHEDULE_DISABLED");
  }

  const result =
    schedule.targetType === "task"
      ? await triggerScheduledTask(
          schedule,
          payload,
          repositories,
          enqueuePort,
          options,
        )
      : await triggerScheduledWorkflow(
          schedule,
          payload,
          repositories,
          enqueuePort,
          options,
        );

  await disableOnceScheduleAfterHandling(schedule, repositories, options);

  return result;
}
