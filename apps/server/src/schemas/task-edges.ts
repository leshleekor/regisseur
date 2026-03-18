import { TASK_EDGE_TYPES, type TaskEdge } from "@regisseur/core";

import { badRequest } from "../errors/http-error.js";
import {
  expectBoolean,
  expectEnumValue,
  expectOptionalString,
  expectRecord,
  expectString,
} from "../utils/parse-body.js";

function parseTaskEdgeRecord(value: unknown, fieldName: string): TaskEdge {
  const body = expectRecord(value, fieldName);

  return {
    fromTaskId: expectString(body.fromTaskId, `${fieldName}.fromTaskId`),
    toTaskId: expectString(body.toTaskId, `${fieldName}.toTaskId`),
    type:
      body.type === undefined
        ? "depends_on"
        : expectEnumValue(body.type, TASK_EDGE_TYPES, `${fieldName}.type`),
    ...(body.injectOutput !== undefined
      ? {
          injectOutput: expectBoolean(
            body.injectOutput,
            `${fieldName}.injectOutput`,
          ),
        }
      : {}),
    ...(body.outputMergeKey !== undefined
      ? {
          outputMergeKey: expectOptionalString(
            body.outputMergeKey,
            `${fieldName}.outputMergeKey`,
          ),
        }
      : {}),
  };
}

export function parseTaskEdgeBody(value: unknown): TaskEdge {
  return parseTaskEdgeRecord(value, "body");
}

export function parseTaskEdgeBulkBody(value: unknown): readonly TaskEdge[] {
  const body = expectRecord(value, "body");
  const rawEdges = body.edges;

  if (!Array.isArray(rawEdges) || rawEdges.length === 0) {
    throw badRequest("body.edges must be a non-empty array");
  }

  return rawEdges.map((edge, index) =>
    parseTaskEdgeRecord(edge, `body.edges[${index}]`),
  );
}
