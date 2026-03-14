import type { TimestampValue } from "../types.js";

export function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}

export function toIsoTimestamp(value: TimestampValue): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function toOptionalIsoTimestamp(
  value: TimestampValue | null,
): string | undefined {
  return value === null ? undefined : toIsoTimestamp(value);
}
