import {
  WORKFLOW_STATUSES,
  type Workflow,
  type WorkflowStatus,
} from "@regisseur/core";

import {
  expectEnumValue,
  expectOptionalObject,
  expectRecord,
  expectString,
} from "../utils/parse-body.js";

export interface WorkflowsQuery {
  status?: WorkflowStatus;
}

export function parseWorkflowBody(value: unknown): Workflow {
  const body = expectRecord(value, "body");

  return {
    workflowId: expectString(body.workflowId, "workflowId"),
    name: expectString(body.name, "name"),
    status: expectEnumValue(body.status, WORKFLOW_STATUSES, "status"),
    createdAt: expectString(body.createdAt, "createdAt"),
    updatedAt: expectString(body.updatedAt, "updatedAt"),
    metadata: expectOptionalObject(body.metadata, "metadata"),
  };
}

export function parseWorkflowsQuery(value: unknown): WorkflowsQuery {
  const query = expectRecord(value ?? {}, "query");

  if (query.status === undefined) {
    return {};
  }

  return {
    status: expectEnumValue(query.status, WORKFLOW_STATUSES, "status"),
  };
}
