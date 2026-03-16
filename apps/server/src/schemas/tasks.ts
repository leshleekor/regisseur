import {
  DISPATCH_TRIGGER_SOURCES,
  TASK_STATUSES,
  type DispatchTriggerSource,
  type Task,
  type TaskStatus,
} from "@regisseur/core";

import { badRequest } from "../errors/http-error.js";
import {
  expectEnumValue,
  expectObject,
  expectOptionalObject,
  expectOptionalString,
  expectRecord,
  expectString,
} from "../utils/parse-body.js";

export type TasksQuery =
  | {
      workflowId: string;
    }
  | {
      status: TaskStatus;
    };

export interface TaskDispatchBody {
  triggerSource: DispatchTriggerSource;
}

function expectNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw badRequest(`${fieldName} must be a number`);
  }

  return value;
}

export function parseTaskBody(value: unknown): Task {
  const body = expectRecord(value, "body");

  return {
    taskId: expectString(body.taskId, "taskId"),
    workflowId: expectString(body.workflowId, "workflowId"),
    title: expectString(body.title, "title"),
    payload: expectObject(body.payload, "payload"),
    status: expectEnumValue(body.status, TASK_STATUSES, "status"),
    assigneeAgentId: expectOptionalString(
      body.assigneeAgentId,
      "assigneeAgentId",
    ),
    retryCount: expectNumber(body.retryCount, "retryCount"),
    taskTemplateId: expectOptionalString(body.taskTemplateId, "taskTemplateId"),
    concurrencyKey: expectOptionalString(body.concurrencyKey, "concurrencyKey"),
    metadata: expectOptionalObject(body.metadata, "metadata"),
    createdAt: expectString(body.createdAt, "createdAt"),
    updatedAt: expectString(body.updatedAt, "updatedAt"),
  };
}

export function parseTasksQuery(value: unknown): TasksQuery {
  const query = expectRecord(value ?? {}, "query");
  const workflowId = expectOptionalString(query.workflowId, "workflowId");
  const status =
    query.status === undefined
      ? undefined
      : expectEnumValue(query.status, TASK_STATUSES, "status");
  const filterCount =
    Number(workflowId !== undefined) + Number(status !== undefined);

  if (filterCount !== 1) {
    throw badRequest("Provide exactly one of workflowId or status");
  }

  if (workflowId !== undefined) {
    return { workflowId };
  }

  return { status: status as TaskStatus };
}

export function parseTaskDispatchBody(value: unknown): TaskDispatchBody {
  if (value === undefined) {
    return {
      triggerSource: "manual",
    };
  }

  const body = expectRecord(value, "body");

  return {
    triggerSource:
      body.triggerSource === undefined
        ? "manual"
        : expectEnumValue(
            body.triggerSource,
            DISPATCH_TRIGGER_SOURCES,
            "triggerSource",
          ),
  };
}
