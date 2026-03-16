import {
  TASK_TEMPLATE_EDGE_TYPES,
  type TaskTemplateEdge,
} from "@regisseur/core";

import { badRequest } from "../errors/http-error.js";
import {
  expectEnumValue,
  expectRecord,
  expectString,
} from "../utils/parse-body.js";

function parseTaskTemplateEdgeRecord(
  value: unknown,
  fieldName: string,
): TaskTemplateEdge {
  const body = expectRecord(value, fieldName);

  return {
    fromTaskTemplateId: expectString(
      body.fromTaskTemplateId,
      `${fieldName}.fromTaskTemplateId`,
    ),
    toTaskTemplateId: expectString(
      body.toTaskTemplateId,
      `${fieldName}.toTaskTemplateId`,
    ),
    type:
      body.type === undefined
        ? "depends_on"
        : expectEnumValue(
            body.type,
            TASK_TEMPLATE_EDGE_TYPES,
            `${fieldName}.type`,
          ),
  };
}

export function parseTaskTemplateEdgeBody(value: unknown): TaskTemplateEdge {
  return parseTaskTemplateEdgeRecord(value, "body");
}

export function parseTaskTemplateEdgeBulkBody(
  value: unknown,
): readonly TaskTemplateEdge[] {
  const body = expectRecord(value, "body");
  const rawEdges = body.edges;

  if (!Array.isArray(rawEdges) || rawEdges.length === 0) {
    throw badRequest("body.edges must be a non-empty array");
  }

  return rawEdges.map((edge, index) =>
    parseTaskTemplateEdgeRecord(edge, `body.edges[${index}]`),
  );
}
