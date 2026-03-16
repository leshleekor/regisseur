import {
  evaluateTaskReadiness,
  getDependencyTaskIds,
  type AgentDefinition,
  type Schedule,
  type Task,
  type TaskEdge,
} from "@regisseur/core";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";
import type { ScheduleTriggerJobPayload } from "@regisseur/queue-bullmq";

import {
  selectPersistAndEnqueue,
  type SelectPersistAndEnqueueResult,
} from "../execution/dispatch-persistence.js";
import type {
  AgentsRepositoryLike,
  SchedulesRepositoryLike,
  TaskEdgesRepositoryLike,
  TasksRepositoryLike,
  WorkflowsRepositoryLike,
} from "../types.js";

export interface ScheduleTriggerRepositories {
  agentsRepository: AgentsRepositoryLike;
  schedulesRepository: SchedulesRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
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
    | "WORKFLOW_NOT_FOUND"
    | "WORKFLOW_FAILED"
    | "NO_READY_ROOT_TASKS";
}

export interface HandleScheduleTriggerOptions {
  now?: () => string;
  selectPersistAndEnqueueImpl?: typeof selectPersistAndEnqueue;
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

function getRootTasks(
  tasks: readonly Task[],
  edges: readonly TaskEdge[],
): Task[] {
  return tasks.filter(
    (task) => getDependencyTaskIds(task.taskId, edges).length === 0,
  );
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
  const workflow = await repositories.workflowsRepository.findById(
    schedule.targetId,
  );

  if (!workflow) {
    return createSkippedResult(schedule.scheduleId, "WORKFLOW_NOT_FOUND");
  }

  if (workflow.status === "failed") {
    return createSkippedResult(schedule.scheduleId, "WORKFLOW_FAILED");
  }

  const tasks = await repositories.tasksRepository.findByWorkflowId(
    workflow.workflowId,
  );
  const taskIds = tasks.map((task) => task.taskId);
  const edges =
    taskIds.length === 0
      ? []
      : await repositories.taskEdgesRepository.findAllByWorkflowTasks(taskIds);
  const rootTasks = getRootTasks(tasks, edges).filter(
    (task) => evaluateTaskReadiness(task, tasks, edges).isReady,
  );

  if (rootTasks.length === 0) {
    return createSkippedResult(schedule.scheduleId, "NO_READY_ROOT_TASKS");
  }

  const allAgents = await getAllAgents(repositories);
  const enqueuedTaskIds: string[] = [];

  for (const rootTask of rootTasks) {
    const result = assertEnqueueDidNotFail(
      await (options.selectPersistAndEnqueueImpl ?? selectPersistAndEnqueue)(
        rootTask,
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

    if (result.ok) {
      enqueuedTaskIds.push(result.taskId);
    }
  }

  return {
    scheduleId: schedule.scheduleId,
    enqueuedTaskIds,
    skipped: enqueuedTaskIds.length === 0,
    skippedReason:
      enqueuedTaskIds.length === 0 ? "NO_READY_ROOT_TASKS" : undefined,
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
