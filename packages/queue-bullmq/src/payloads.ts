import {
  DISPATCH_TRIGGER_SOURCES,
  type DispatchTriggerSource,
} from "@regisseur/core";

export const TASK_DISPATCH_TRIGGER_SOURCES = DISPATCH_TRIGGER_SOURCES;

/**
 * Sources that can request a task dispatch job.
 */
export type TaskDispatchTriggerSource = DispatchTriggerSource;

/**
 * Minimum payload required to enqueue a task dispatch job.
 */
export interface TaskDispatchJobPayload {
  taskId: string;
  workflowId: string;
  triggerSource: TaskDispatchTriggerSource;
  requestedAt: string;
}

export const SCHEDULE_TRIGGER_TARGET_TYPES = ["workflow", "task"] as const;

/**
 * Targets that a schedule trigger job can activate.
 */
export type ScheduleTriggerTargetType =
  (typeof SCHEDULE_TRIGGER_TARGET_TYPES)[number];

/**
 * Minimum payload required to enqueue a schedule trigger job.
 */
export interface ScheduleTriggerJobPayload {
  scheduleId: string;
  targetType: ScheduleTriggerTargetType;
  targetId: string;
  triggeredAt: string;
}

/**
 * Creates a task dispatch payload while copying the input object so tests and
 * callers can safely treat the returned payload as queue-owned data.
 */
export function createTaskDispatchJobPayload(
  payload: TaskDispatchJobPayload,
): TaskDispatchJobPayload {
  return { ...payload };
}

/**
 * Creates a schedule trigger payload while copying the input object so tests
 * and callers can safely treat the returned payload as queue-owned data.
 */
export function createScheduleTriggerJobPayload(
  payload: ScheduleTriggerJobPayload,
): ScheduleTriggerJobPayload {
  return { ...payload };
}
