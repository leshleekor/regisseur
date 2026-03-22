import type { Task, Workflow, WorkflowStatus } from "@regisseur/core";

import type { TasksRepositoryLike, WorkflowsRepositoryLike } from "../types.js";

export interface WorkflowStatusRepositories {
  tasksRepository: TasksRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
}

export interface UpdateWorkflowStatusOptions {
  preserveTerminalStatuses?: readonly WorkflowStatus[];
}

const DEFAULT_PRESERVED_TERMINAL_STATUSES = [
  "failed",
  "cancelled",
] as const satisfies readonly WorkflowStatus[];

export function deriveWorkflowStatus(tasks: readonly Task[]): WorkflowStatus {
  if (tasks.some((task) => task.status === "failed")) {
    return "failed";
  }

  if (
    tasks.some((task) => task.status === "queued" || task.status === "running")
  ) {
    return "running";
  }

  if (tasks.length > 0 && tasks.every((task) => task.status === "succeeded")) {
    return "succeeded";
  }

  if (
    tasks.length > 0 &&
    tasks.every(
      (task) => task.status === "succeeded" || task.status === "cancelled",
    ) &&
    tasks.some((task) => task.status === "cancelled")
  ) {
    return "cancelled";
  }

  return "pending";
}

export async function updateWorkflowStatus(
  workflowId: string,
  repositories: WorkflowStatusRepositories,
  now: string = new Date().toISOString(),
  options: UpdateWorkflowStatusOptions = {},
): Promise<Workflow | null> {
  const [workflow, tasks] = await Promise.all([
    repositories.workflowsRepository.findById(workflowId),
    repositories.tasksRepository.findByWorkflowId(workflowId),
  ]);

  if (!workflow) {
    return null;
  }

  const status = deriveWorkflowStatus(tasks);
  const preservedTerminalStatuses = new Set<WorkflowStatus>(
    options.preserveTerminalStatuses ?? DEFAULT_PRESERVED_TERMINAL_STATUSES,
  );
  const terminalStatus =
    preservedTerminalStatuses.has(workflow.status) && workflow.status !== status
      ? workflow.status
      : status;
  const updatedWorkflow =
    workflow.status === terminalStatus
      ? workflow
      : {
          ...workflow,
          status: terminalStatus,
          updatedAt: now,
        };

  if (updatedWorkflow !== workflow) {
    await repositories.workflowsRepository.upsert(updatedWorkflow);
  }

  return updatedWorkflow;
}
