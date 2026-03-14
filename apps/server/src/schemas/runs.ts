import { RUN_STATUSES, type Run, type RunStatus } from "@regisseur/core";

import { badRequest } from "../errors/http-error.js";
import {
  expectEnumValue,
  expectOptionalObject,
  expectOptionalString,
  expectRecord,
  expectString,
} from "../utils/parse-body.js";

export type RunsQuery =
  | {
      taskId: string;
    }
  | {
      agentId: string;
    }
  | {
      status: RunStatus;
    };

export function parseRunBody(value: unknown): Run {
  const body = expectRecord(value, "body");

  return {
    runId: expectString(body.runId, "runId"),
    taskId: expectString(body.taskId, "taskId"),
    agentId: expectString(body.agentId, "agentId"),
    status: expectEnumValue(body.status, RUN_STATUSES, "status"),
    startedAt: expectOptionalString(body.startedAt, "startedAt"),
    finishedAt: expectOptionalString(body.finishedAt, "finishedAt"),
    output: expectOptionalObject(body.output, "output"),
    error: expectOptionalString(body.error, "error"),
    createdAt: expectString(body.createdAt, "createdAt"),
    updatedAt: expectString(body.updatedAt, "updatedAt"),
  };
}

export function parseRunsQuery(value: unknown): RunsQuery {
  const query = expectRecord(value ?? {}, "query");
  const taskId = expectOptionalString(query.taskId, "taskId");
  const agentId = expectOptionalString(query.agentId, "agentId");
  const status =
    query.status === undefined
      ? undefined
      : expectEnumValue(query.status, RUN_STATUSES, "status");
  const filterCount =
    Number(taskId !== undefined) +
    Number(agentId !== undefined) +
    Number(status !== undefined);

  if (filterCount !== 1) {
    throw badRequest("Provide exactly one of taskId, agentId, or status");
  }

  if (taskId !== undefined) {
    return { taskId };
  }

  if (agentId !== undefined) {
    return { agentId };
  }

  return { status: status as RunStatus };
}
