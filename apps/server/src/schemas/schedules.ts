import {
  SCHEDULE_TARGET_TYPES,
  SCHEDULE_TYPES,
  type Schedule,
  type ScheduleTargetType,
} from "@regisseur/core";

import { badRequest } from "../errors/http-error.js";
import {
  expectBoolean,
  expectEnumValue,
  expectOptionalString,
  expectRecord,
  expectString,
  expectTrueQueryFlag,
} from "../utils/parse-body.js";

export type SchedulesQuery =
  | Record<string, never>
  | {
      enabled: true;
    }
  | {
      targetType: ScheduleTargetType;
      targetId: string;
    };

export function parseScheduleBody(value: unknown): Schedule {
  const body = expectRecord(value, "body");
  const type = expectEnumValue(body.type, SCHEDULE_TYPES, "type");
  const cronExpression = expectOptionalString(
    body.cronExpression,
    "cronExpression",
  );
  const runAt = expectOptionalString(body.runAt, "runAt");

  if (type === "once" && !runAt) {
    throw badRequest("once schedules require runAt");
  }

  if (type === "cron" && !cronExpression) {
    throw badRequest("cron schedules require cronExpression");
  }

  if (type === "once" && cronExpression !== undefined) {
    throw badRequest("once schedules cannot include cronExpression");
  }

  if (type === "cron" && runAt !== undefined) {
    throw badRequest("cron schedules cannot include runAt");
  }

  return {
    scheduleId: expectString(body.scheduleId, "scheduleId"),
    type,
    cronExpression,
    runAt,
    timezone: expectOptionalString(body.timezone, "timezone"),
    enabled: expectBoolean(body.enabled, "enabled"),
    targetType: expectEnumValue(
      body.targetType,
      SCHEDULE_TARGET_TYPES,
      "targetType",
    ),
    targetId: expectString(body.targetId, "targetId"),
    createdAt: expectString(body.createdAt, "createdAt"),
    updatedAt: expectString(body.updatedAt, "updatedAt"),
  };
}

export function parseSchedulesQuery(value: unknown): SchedulesQuery {
  const query = expectRecord(value ?? {}, "query");
  const enabled = expectTrueQueryFlag(query.enabled, "enabled");
  const targetType =
    query.targetType === undefined
      ? undefined
      : expectEnumValue(query.targetType, SCHEDULE_TARGET_TYPES, "targetType");
  const targetId = expectOptionalString(query.targetId, "targetId");

  if (enabled) {
    if (targetType !== undefined || targetId !== undefined) {
      throw badRequest(
        "enabled cannot be combined with targetType or targetId",
      );
    }

    return { enabled: true };
  }

  if (targetType === undefined && targetId === undefined) {
    return {};
  }

  if (targetType === undefined || targetId === undefined) {
    throw badRequest("targetType and targetId must be provided together");
  }

  return { targetType, targetId };
}
