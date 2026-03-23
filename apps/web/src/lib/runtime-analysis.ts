import type { Run, Task, TaskEdge } from "@regisseur/core";

export interface TaskRunSummary {
  total: number;
  succeeded: number;
  failed: number;
  timeout: number;
  cancelled: number;
  latest?: Run;
  latestSucceeded?: Run;
}

export interface InjectionPreview {
  payload: Record<string, unknown>;
  applied: Array<{
    fromTaskId: string;
    outputMergeKey: string;
    runId: string;
  }>;
  missing: Array<{
    fromTaskId: string;
    reason: "MISSING_OUTPUT_MERGE_KEY" | "NO_SUCCEEDED_RUN" | "NO_OUTPUT";
  }>;
}

export function buildTaskRunSummary(runs: readonly Run[]): TaskRunSummary {
  const latest = [...runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const latestSucceeded = [...runs]
    .filter((run) => run.status === "succeeded")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  return {
    total: runs.length,
    succeeded: runs.filter((run) => run.status === "succeeded").length,
    failed: runs.filter((run) => run.status === "failed").length,
    timeout: runs.filter((run) => run.status === "timeout").length,
    cancelled: runs.filter((run) => run.status === "cancelled").length,
    latest,
    latestSucceeded,
  };
}

export function buildTaskRunSummaries(
  runsByTaskId: ReadonlyMap<string, readonly Run[]>,
): Map<string, TaskRunSummary> {
  const result = new Map<string, TaskRunSummary>();

  runsByTaskId.forEach((runs, taskId) => {
    result.set(taskId, buildTaskRunSummary(runs));
  });

  return result;
}

export function reconstructInjectedPayload(
  task: Task,
  incomingEdges: readonly TaskEdge[],
  latestSucceededRunsByTaskId: ReadonlyMap<string, Run | undefined>,
): InjectionPreview {
  const payload = { ...task.payload };
  const applied: InjectionPreview["applied"] = [];
  const missing: InjectionPreview["missing"] = [];

  incomingEdges
    .filter((edge) => edge.toTaskId === task.taskId && edge.injectOutput)
    .forEach((edge) => {
      if (!edge.outputMergeKey) {
        missing.push({
          fromTaskId: edge.fromTaskId,
          reason: "MISSING_OUTPUT_MERGE_KEY",
        });
        return;
      }

      const run = latestSucceededRunsByTaskId.get(edge.fromTaskId);

      if (!run) {
        missing.push({
          fromTaskId: edge.fromTaskId,
          reason: "NO_SUCCEEDED_RUN",
        });
        return;
      }

      if (run.output === undefined) {
        missing.push({
          fromTaskId: edge.fromTaskId,
          reason: "NO_OUTPUT",
        });
        return;
      }

      payload[edge.outputMergeKey] = run.output;
      applied.push({
        fromTaskId: edge.fromTaskId,
        outputMergeKey: edge.outputMergeKey,
        runId: run.runId,
      });
    });

  return {
    payload,
    applied,
    missing,
  };
}

export function collectDownstreamBlockedTasks(
  failedTaskId: string,
  tasks: readonly Task[],
  edges: readonly TaskEdge[],
): Array<{
  edge: TaskEdge;
  task: Task;
}> {
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));

  return edges
    .filter((edge) => edge.fromTaskId === failedTaskId)
    .map((edge) => ({
      edge,
      task: taskById.get(edge.toTaskId),
    }))
    .filter(
      (entry): entry is { edge: TaskEdge; task: Task } =>
        Boolean(entry.task) &&
        (entry.task.status === "blocked" || entry.task.status === "waiting"),
    );
}

export function payloadChanged(
  persistedPayload: Record<string, unknown>,
  reconstructedPayload: Record<string, unknown>,
): boolean {
  return JSON.stringify(persistedPayload) !== JSON.stringify(reconstructedPayload);
}
