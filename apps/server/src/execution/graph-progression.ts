import {
  evaluateTaskReadiness,
  getDependentTaskIds,
  type Task,
} from "@regisseur/core";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import type {
  AgentsRepositoryLike,
  RunsRepositoryLike,
  TaskEdgesRepositoryLike,
  TasksRepositoryLike,
  WorkflowsRepositoryLike,
} from "../types.js";
import { injectUpstreamOutputs } from "./inject-upstream-outputs.js";
import {
  selectPersistAndEnqueue,
  type SelectPersistAndEnqueueResult,
} from "./dispatch-persistence.js";

export interface GraphProgressionRepositories {
  agentsRepository: AgentsRepositoryLike;
  runsRepository: RunsRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
}

export interface GraphProgressionFailure {
  taskId: string;
  reason: string;
  message: string;
}

export interface GraphProgressionResult {
  enqueuedTaskIds: string[];
  skippedTaskIds: string[];
  failures: GraphProgressionFailure[];
  skippedBecauseWorkflowFailed: boolean;
}

export interface ProgressDownstreamTasksOptions {
  now?: () => string;
  selectPersistAndEnqueueImpl?: typeof selectPersistAndEnqueue;
}

function createFailure(
  taskId: string,
  message: string,
): GraphProgressionFailure {
  return {
    taskId,
    reason: "UNEXPECTED_ERROR",
    message,
  };
}

function tasksById(tasks: readonly Task[]): ReadonlyMap<string, Task> {
  return new Map(tasks.map((task) => [task.taskId, task]));
}

export async function progressDownstreamTasks(
  succeededTask: Task,
  repositories: GraphProgressionRepositories,
  enqueuePort: DispatchEnqueuePort,
  options: ProgressDownstreamTasksOptions = {},
): Promise<GraphProgressionResult> {
  const selectPersistAndEnqueueImpl =
    options.selectPersistAndEnqueueImpl ?? selectPersistAndEnqueue;
  const workflow = await repositories.workflowsRepository.findById(
    succeededTask.workflowId,
  );

  if (workflow?.status === "failed") {
    return {
      enqueuedTaskIds: [],
      skippedTaskIds: [],
      failures: [],
      skippedBecauseWorkflowFailed: true,
    };
  }

  const allTasks = await repositories.tasksRepository.findByWorkflowId(
    succeededTask.workflowId,
  );
  const allTaskIds = allTasks.map((task) => task.taskId);
  const edges =
    allTaskIds.length === 0
      ? []
      : await repositories.taskEdgesRepository.findAllByWorkflowTasks(
          allTaskIds,
        );
  const dependentTaskIds = getDependentTaskIds(succeededTask.taskId, edges);
  const allAgents = await repositories.agentsRepository.findAll();
  const taskLookup = tasksById(allTasks);
  const enqueuedTaskIds: string[] = [];
  const skippedTaskIds: string[] = [];
  const failures: GraphProgressionFailure[] = [];

  for (const dependentTaskId of dependentTaskIds) {
    const candidate = taskLookup.get(dependentTaskId);

    if (!candidate) {
      failures.push(
        createFailure(
          dependentTaskId,
          `Downstream task ${dependentTaskId} is missing from workflow ${succeededTask.workflowId}`,
        ),
      );
      continue;
    }

    const readiness = evaluateTaskReadiness(candidate, allTasks, edges);

    if (!readiness.canBecomeReady) {
      skippedTaskIds.push(candidate.taskId);
      continue;
    }

    try {
      const injectedCandidate = await injectUpstreamOutputs(
        candidate,
        edges,
        repositories.runsRepository,
      );
      const result: SelectPersistAndEnqueueResult =
        await selectPersistAndEnqueueImpl(
          injectedCandidate,
          allAgents,
          repositories,
          enqueuePort,
          {
            triggerSource: "internal",
            requestedAt: options.now?.() ?? new Date().toISOString(),
            selectionFailureMode: "fail_task",
            now: options.now,
          },
        );

      if (result.ok) {
        enqueuedTaskIds.push(result.taskId);
        continue;
      }

      failures.push({
        taskId: result.taskId,
        reason: result.reason,
        message: result.message,
      });
    } catch (error) {
      failures.push(
        createFailure(
          candidate.taskId,
          error instanceof Error
            ? error.message
            : `Unknown progression error for ${candidate.taskId}`,
        ),
      );
    }
  }

  return {
    enqueuedTaskIds,
    skippedTaskIds,
    failures,
    skippedBecauseWorkflowFailed: false,
  };
}
