import type { Task, TaskEdge } from "@regisseur/core";

import type { RunsRepositoryLike } from "../types.js";

export async function injectUpstreamOutputs(
  task: Task,
  allEdges: readonly TaskEdge[],
  runsRepository: RunsRepositoryLike,
): Promise<Task> {
  const injectEdges = allEdges.filter(
    (edge) => edge.toTaskId === task.taskId && edge.injectOutput === true,
  );

  if (injectEdges.length === 0) {
    return task;
  }

  let payload: Record<string, unknown> | null = null;

  for (const edge of injectEdges) {
    if (edge.outputMergeKey === undefined) {
      continue;
    }

    const run = await runsRepository.findLatestSucceededByTaskId(
      edge.fromTaskId,
    );

    if (!run || run.output === undefined) {
      continue;
    }

    if (payload === null) {
      payload = { ...task.payload };
    }

    payload[edge.outputMergeKey] = run.output;
  }

  if (payload === null) {
    return task;
  }

  return {
    ...task,
    payload,
  };
}
