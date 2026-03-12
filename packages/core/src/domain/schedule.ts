import type { IsoTimestamp } from "./shared.js";

export const SCHEDULE_TYPES = ["once", "cron"] as const;

/**
 * Supported schedule trigger types.
 */
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const SCHEDULE_TARGET_TYPES = ["workflow", "task"] as const;

/**
 * Kinds of resources that a schedule can trigger.
 */
export type ScheduleTargetType = (typeof SCHEDULE_TARGET_TYPES)[number];

/**
 * Schedule describes when a workflow or task should be triggered.
 */
export interface Schedule {
  /** Stable unique identifier for the schedule definition. */
  scheduleId: string;
  /** Trigger mode that decides whether cronExpression or runAt is used. */
  type: ScheduleType;
  /** Cron expression used when the schedule type is cron. */
  cronExpression?: string;
  /** Absolute run time used when the schedule type is once. */
  runAt?: IsoTimestamp;
  /** IANA timezone name used when evaluating cron schedules. */
  timezone?: string;
  /** Whether the schedule is active and eligible to trigger executions. */
  enabled: boolean;
  /** Declares whether the schedule targets a workflow or an individual task. */
  targetType: ScheduleTargetType;
  /** Identifier of the workflow or task targeted by this schedule. */
  targetId: string;
  /** Creation timestamp recorded when the schedule is first persisted. */
  createdAt: IsoTimestamp;
  /** Last update timestamp for schedule configuration changes. */
  updatedAt: IsoTimestamp;
}
