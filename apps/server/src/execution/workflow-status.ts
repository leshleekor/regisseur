import type { Task, Workflow, WorkflowStatus } from "@regisseur/core";

import type { TasksRepositoryLike, WorkflowsRepositoryLike } from "../types.js";

export interface WorkflowStatusRepositories {
  tasksRepository: TasksRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
}

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

  return "pending";
}

export async function updateWorkflowStatus(
  workflowId: string,
  repositories: WorkflowStatusRepositories,
  now: string = new Date().toISOString(),
): Promise<Workflow | null> {
  const [workflow, tasks] = await Promise.all([
    repositories.workflowsRepository.findById(workflowId),
    repositories.tasksRepository.findByWorkflowId(workflowId),
  ]);

  if (!workflow) {
    return null;
  }

  const status = deriveWorkflowStatus(tasks);
  const terminalStatus =
    workflow.status === "failed" && status !== "failed" ? "failed" : status;
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
