import type { AgentDefinition, Task } from "@regisseur/core";
import {
  createDispatchRequest,
  selectAgentForTask,
  type AgentSelectionFailureReason,
  type DispatchEnqueuePort,
  type DispatchRequestOptions,
} from "@regisseur/dispatcher";

import type { TasksRepositoryLike, WorkflowsRepositoryLike } from "../types.js";
import { updateWorkflowStatus } from "./workflow-status.js";

export interface SelectPersistAndEnqueueRepositories {
  tasksRepository: TasksRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
}

export interface SelectPersistAndEnqueueSuccess {
  ok: true;
  taskId: string;
  workflowId: string;
  agentId: string;
  enqueueResult: {
    ok: true;
    jobId?: string;
  };
}

export interface SelectPersistAndEnqueueFailure {
  ok: false;
  taskId: string;
  workflowId: string;
  reason: AgentSelectionFailureReason | "ENQUEUE_FAILED";
  message: string;
}

export type SelectPersistAndEnqueueResult =
  | SelectPersistAndEnqueueSuccess
  | SelectPersistAndEnqueueFailure;

export interface SelectPersistAndEnqueueOptions extends DispatchRequestOptions {
  selectionFailureMode?: "return" | "fail_task";
  now?: () => string;
  updateWorkflowStatusImpl?: typeof updateWorkflowStatus;
}

function createFailureResult(
  task: Task,
  reason: SelectPersistAndEnqueueFailure["reason"],
  message: string,
): SelectPersistAndEnqueueFailure {
  return {
    ok: false,
    taskId: task.taskId,
    workflowId: task.workflowId,
    reason,
    message,
  };
}

export async function selectPersistAndEnqueue(
  task: Task,
  agents: readonly AgentDefinition[],
  repositories: SelectPersistAndEnqueueRepositories,
  enqueuePort: DispatchEnqueuePort,
  options: SelectPersistAndEnqueueOptions = {},
): Promise<SelectPersistAndEnqueueResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const workflowStatusUpdater =
    options.updateWorkflowStatusImpl ?? updateWorkflowStatus;
  const selectionResult = selectAgentForTask(task, agents);

  if (!selectionResult.ok) {
    if (options.selectionFailureMode === "fail_task") {
      await repositories.tasksRepository.upsert({
        ...task,
        status: "failed",
        updatedAt: now(),
      });
      await workflowStatusUpdater(task.workflowId, repositories, now());
    }

    return createFailureResult(
      task,
      selectionResult.reason,
      selectionResult.message,
    );
  }

  const queuedTask: Task = {
    ...task,
    assigneeAgentId: selectionResult.agent.agentId,
    status: "queued",
    updatedAt: now(),
  };

  await repositories.tasksRepository.upsert(queuedTask);
  await workflowStatusUpdater(task.workflowId, repositories, now());

  const enqueueResult = await enqueuePort.enqueueTaskDispatch(
    createDispatchRequest(queuedTask, selectionResult.agent, {
      triggerSource: options.triggerSource,
      requestedAt: options.requestedAt ?? now(),
    }),
  );

  if (!enqueueResult.ok) {
    return createFailureResult(task, "ENQUEUE_FAILED", enqueueResult.message);
  }

  return {
    ok: true,
    taskId: task.taskId,
    workflowId: task.workflowId,
    agentId: selectionResult.agent.agentId,
    enqueueResult,
  };
}
