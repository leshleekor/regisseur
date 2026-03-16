/**
 * ISO-8601 timestamp string used across persisted orchestration records.
 *
 * Runtime validation is intentionally left to higher layers.
 */
export type IsoTimestamp = string;

export const DISPATCH_TRIGGER_SOURCES = [
  "manual",
  "schedule",
  "internal",
] as const;

/**
 * Sources that can create or enqueue runtime workflow/task execution.
 */
export type DispatchTriggerSource = (typeof DISPATCH_TRIGGER_SOURCES)[number];
