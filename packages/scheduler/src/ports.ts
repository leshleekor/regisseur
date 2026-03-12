import type { Schedule, ScheduleTargetType } from "@regisseur/core";

/**
 * Queue-independent payload that identifies which schedule target should fire.
 */
export interface ScheduleTriggerRequest {
  scheduleId: string;
  targetType: ScheduleTargetType;
  targetId: string;
  triggeredAt: string;
}

/**
 * Result returned by an enqueue or repeat registration port.
 */
export interface SchedulePortResult {
  jobId?: string | null;
  jobName?: string;
}

/**
 * Delay-based enqueue options for one-time schedules.
 */
export interface ScheduleTriggerEnqueueOptions {
  delayMs?: number;
  jobId?: string;
}

/**
 * Repeat registration options for cron schedules.
 */
export interface CronScheduleRegistrationOptions {
  cronExpression: string;
  jobId?: string;
  timezone?: string;
}

/**
 * Queue-like port required by the scheduler package. Concrete queue backends
 * can implement this structurally without the scheduler importing them.
 */
export interface ScheduleRegistrationPort {
  enqueueScheduleTrigger(
    payload: ScheduleTriggerRequest,
    options?: ScheduleTriggerEnqueueOptions,
  ): Promise<SchedulePortResult>;
  registerCronScheduleTrigger(
    payload: ScheduleTriggerRequest,
    options: CronScheduleRegistrationOptions,
  ): Promise<SchedulePortResult>;
}

/**
 * Result returned by scheduler registration functions.
 */
export interface RegisteredScheduleResult {
  scheduleId: string;
  scheduleType: Schedule["type"];
  skipped: boolean;
  triggerRequest?: ScheduleTriggerRequest;
  delayMs?: number;
  cronExpression?: string;
  timezone?: string;
  jobId?: string | null;
  jobName?: string;
  reason?: "disabled";
}
