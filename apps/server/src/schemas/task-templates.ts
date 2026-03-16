import type { TaskTemplate } from "@regisseur/core";

import {
  expectObject,
  expectOptionalObject,
  expectOptionalString,
  expectRecord,
  expectString,
} from "../utils/parse-body.js";
import { badRequest } from "../errors/http-error.js";

function expectNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw badRequest(`${fieldName} must be a non-negative integer`);
  }

  return value as number;
}

export function parseTaskTemplateBody(
  value: unknown,
  workflowDefinitionId: string,
): TaskTemplate {
  const body = expectRecord(value, "body");

  return {
    taskTemplateId: expectString(body.taskTemplateId, "taskTemplateId"),
    workflowDefinitionId,
    title: expectString(body.title, "title"),
    payload: expectObject(body.payload, "payload"),
    defaultAssigneeAgentId: expectOptionalString(
      body.defaultAssigneeAgentId,
      "defaultAssigneeAgentId",
    ),
    retryCount: expectNonNegativeInteger(body.retryCount, "retryCount"),
    concurrencyKey: expectOptionalString(body.concurrencyKey, "concurrencyKey"),
    createdAt: expectString(body.createdAt, "createdAt"),
    updatedAt: expectString(body.updatedAt, "updatedAt"),
    metadata: expectOptionalObject(body.metadata, "metadata"),
  };
}
