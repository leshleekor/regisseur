import type { TaskEdge, TaskEdgeType } from "@regisseur/core";

import type { TaskEdgeRow, TaskEdgeRowInput } from "../types.js";

export function mapTaskEdgeToRowInput(edge: TaskEdge): TaskEdgeRowInput {
  return {
    from_task_id: edge.fromTaskId,
    to_task_id: edge.toTaskId,
    type: edge.type,
    inject_output: edge.injectOutput ?? false,
    output_merge_key: edge.outputMergeKey ?? null,
  };
}

export function mapTaskEdgeRowToDomain(row: TaskEdgeRow): TaskEdge {
  return {
    fromTaskId: row.from_task_id,
    toTaskId: row.to_task_id,
    type: row.type as TaskEdgeType,
    ...(row.inject_output ? { injectOutput: true } : {}),
    ...(row.output_merge_key !== null
      ? { outputMergeKey: row.output_merge_key }
      : {}),
  };
}
