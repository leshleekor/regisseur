import type { LoopDefinition } from "@regisseur/core";

import { badRequest } from "../errors/http-error.js";
import {
  expectRecord,
  expectString,
  expectStringArray,
} from "../utils/parse-body.js";

function expectPositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw badRequest(
      `${fieldName} must be an integer greater than or equal to 1`,
    );
  }

  return Number(value);
}

function expectNonEmptyStringArray(
  value: unknown,
  fieldName: string,
): string[] {
  const entries = expectStringArray(value, fieldName);

  if (entries.length === 0) {
    throw badRequest(`${fieldName} must be a non-empty array of strings`);
  }

  return entries;
}

export function parseLoopDefinitionBody(
  value: unknown,
  workflowDefinitionId: string,
): LoopDefinition {
  const body = expectRecord(value, "body");

  return {
    loopDefinitionId: expectString(body.loopDefinitionId, "loopDefinitionId"),
    workflowDefinitionId,
    name: expectString(body.name, "name"),
    controllerTaskTemplateId: expectString(
      body.controllerTaskTemplateId,
      "controllerTaskTemplateId",
    ),
    entryTaskTemplateIds: expectNonEmptyStringArray(
      body.entryTaskTemplateIds,
      "entryTaskTemplateIds",
    ),
    bodyTaskTemplateIds: expectNonEmptyStringArray(
      body.bodyTaskTemplateIds,
      "bodyTaskTemplateIds",
    ),
    maxIterations: expectPositiveInteger(body.maxIterations, "maxIterations"),
    createdAt: expectString(body.createdAt, "createdAt"),
    updatedAt: expectString(body.updatedAt, "updatedAt"),
  };
}
