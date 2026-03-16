import type { Schedule } from "@regisseur/core";

import { calculateDelayMs } from "./delay.js";
import type {
  RegisteredScheduleResult,
  ScheduleRegistrationPort,
  ScheduleTriggerRequest,
} from "./ports.js";

/**
 * Optional registration controls used by the scheduler foundation.
 */
export interface RegisterScheduleOptions {
  now?: Date;
}

function createDisabledScheduleResult(
  schedule: Schedule,
): RegisteredScheduleResult {
  return {
    scheduleId: schedule.scheduleId,
    scheduleType: schedule.type,
    skipped: true,
    reason: "disabled",
  };
}

/**
 * Disabled schedules are intentionally skipped rather than throwing so callers
 * can safely pass mixed active/inactive schedules through the same code path.
 */
export function isScheduleRegistrationEnabled(schedule: Schedule): boolean {
  return schedule.enabled;
}

/**
 * Creates the queue-independent trigger request used by the registration port.
 */
export function createScheduleTriggerRequest(
  schedule: Schedule,
  triggeredAt: string,
): ScheduleTriggerRequest {
  return {
    scheduleId: schedule.scheduleId,
    targetType: schedule.targetType,
    targetId: schedule.targetId,
    triggeredAt,
  };
}

/**
 * Registers a one-time schedule by converting runAt into a queue delay.
 */
export async function registerOneTimeSchedule(
  schedule: Schedule,
  port: ScheduleRegistrationPort,
  options: RegisterScheduleOptions = {},
): Promise<RegisteredScheduleResult> {
  if (!isScheduleRegistrationEnabled(schedule)) {
    return createDisabledScheduleResult(schedule);
  }

  if (schedule.type !== "once") {
    throw new Error(
      `registerOneTimeSchedule requires a once schedule, received ${schedule.type}`,
    );
  }

  if (!schedule.runAt) {
    throw new Error(
      `One-time schedule ${schedule.scheduleId} requires runAt to be defined`,
    );
  }

  const now = options.now ?? new Date();
  const delayMs = calculateDelayMs(schedule.runAt, now);
  const triggerRequest = createScheduleTriggerRequest(
    schedule,
    now.toISOString(),
  );
  const registration = await port.enqueueScheduleTrigger(triggerRequest, {
    delayMs,
    jobId: schedule.scheduleId,
  });

  return {
    scheduleId: schedule.scheduleId,
    scheduleType: schedule.type,
    skipped: false,
    triggerRequest,
    delayMs,
    jobId: registration.jobId,
    jobName: registration.jobName,
  };
}

/**
 * Registers a cron schedule through the externally supplied queue port.
 */
export async function registerCronSchedule(
  schedule: Schedule,
  port: ScheduleRegistrationPort,
  options: RegisterScheduleOptions = {},
): Promise<RegisteredScheduleResult> {
  if (!isScheduleRegistrationEnabled(schedule)) {
    return createDisabledScheduleResult(schedule);
  }

  if (schedule.type !== "cron") {
    throw new Error(
      `registerCronSchedule requires a cron schedule, received ${schedule.type}`,
    );
  }

  if (!schedule.cronExpression) {
    throw new Error(
      `Cron schedule ${schedule.scheduleId} requires cronExpression to be defined`,
    );
  }

  const now = options.now ?? new Date();
  const triggerRequest = createScheduleTriggerRequest(
    schedule,
    now.toISOString(),
  );
  const registration = await port.registerCronScheduleTrigger(triggerRequest, {
    cronExpression: schedule.cronExpression,
    jobId: schedule.scheduleId,
    timezone: schedule.timezone,
  });

  return {
    scheduleId: schedule.scheduleId,
    scheduleType: schedule.type,
    skipped: false,
    triggerRequest,
    cronExpression: schedule.cronExpression,
    timezone: schedule.timezone,
    jobId: registration.jobId,
    jobName: registration.jobName,
  };
}

/**
 * Registers any supported schedule type using the queue-independent port.
 */
export function registerSchedule(
  schedule: Schedule,
  port: ScheduleRegistrationPort,
  options: RegisterScheduleOptions = {},
): Promise<RegisteredScheduleResult> {
  if (schedule.type === "once") {
    return registerOneTimeSchedule(schedule, port, options);
  }

  return registerCronSchedule(schedule, port, options);
}
