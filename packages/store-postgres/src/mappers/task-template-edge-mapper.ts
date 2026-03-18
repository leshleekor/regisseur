import type { TaskTemplateEdge } from "@regisseur/core";

import type {
  TaskTemplateEdgeRow,
  TaskTemplateEdgeRowInput,
} from "../types.js";

export function mapTaskTemplateEdgeToRowInput(
  edge: TaskTemplateEdge,
): TaskTemplateEdgeRowInput {
  return {
    from_task_template_id: edge.fromTaskTemplateId,
    to_task_template_id: edge.toTaskTemplateId,
    type: edge.type,
    inject_output: edge.injectOutput ?? false,
    output_merge_key: edge.outputMergeKey ?? null,
  };
}

export function mapTaskTemplateEdgeRowToDomain(
  row: TaskTemplateEdgeRow,
): TaskTemplateEdge {
  return {
    fromTaskTemplateId: row.from_task_template_id,
    toTaskTemplateId: row.to_task_template_id,
    type: row.type as TaskTemplateEdge["type"],
    ...(row.inject_output ? { injectOutput: true } : {}),
    ...(row.output_merge_key !== null
      ? { outputMergeKey: row.output_merge_key }
      : {}),
  };
}
