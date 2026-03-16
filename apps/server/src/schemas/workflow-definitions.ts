import type { WorkflowDefinition } from "@regisseur/core";

import {
  expectBoolean,
  expectOptionalObject,
  expectOptionalString,
  expectRecord,
  expectString,
  expectTrueQueryFlag,
} from "../utils/parse-body.js";

export interface WorkflowDefinitionsQuery {
  enabled?: true;
}

export function parseWorkflowDefinitionBody(
  value: unknown,
): WorkflowDefinition {
  const body = expectRecord(value, "body");

  return {
    workflowDefinitionId: expectString(
      body.workflowDefinitionId,
      "workflowDefinitionId",
    ),
    name: expectString(body.name, "name"),
    description: expectOptionalString(body.description, "description"),
    enabled: expectBoolean(body.enabled, "enabled"),
    createdAt: expectString(body.createdAt, "createdAt"),
    updatedAt: expectString(body.updatedAt, "updatedAt"),
    metadata: expectOptionalObject(body.metadata, "metadata"),
  };
}

export function parseWorkflowDefinitionsQuery(
  value: unknown,
): WorkflowDefinitionsQuery {
  const query = expectRecord(value ?? {}, "query");

  return {
    enabled: expectTrueQueryFlag(query.enabled, "enabled"),
  };
}
