import { randomUUID } from "node:crypto";

import type { Run, Task } from "@regisseur/core";
import type { TaskDispatchJobPayload } from "@regisseur/queue-bullmq";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import type {
  AgentsRepositoryLike,
  ExecutableAdapterRegistry,
  RunsRepositoryLike,
  TaskEdgesRepositoryLike,
  TasksRepositoryLike,
  WorkflowsRepositoryLike,
} from "../types.js";
import { getExecutionAdapter } from "./adapter-registry.js";
import { progressDownstreamTasks } from "./graph-progression.js";
import { updateWorkflowStatus } from "./workflow-status.js";

export interface ExecutionServiceRepositories {
  agentsRepository: AgentsRepositoryLike;
  runsRepository: RunsRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
}

export interface ExecuteTaskLifecycleOptions {
  now?: () => string;
  randomUUIDImpl?: () => string;
  progressDownstreamTasksImpl?: typeof progressDownstreamTasks;
  updateWorkflowStatusImpl?: typeof updateWorkflowStatus;
  logError?: (message: string) => void;
}

export type ExecuteTaskLifecycleResult =
  | {
      ok: true;
      run: Run;
      task: Task;
    }
  | {
      ok: false;
      message: string;
      reason:
        | "TASK_NOT_FOUND"
        | "AGENT_NOT_FOUND"
        | "ADAPTER_NOT_FOUND"
        | "EXECUTION_FAILED";
    };

function createRunForExecution(
  task: Task,
  agentId: string,
  runId: string,
  now: string,
): Run {
  return {
    runId,
    taskId: task.taskId,
    agentId,
    status: "running",
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function persistFailedTaskWithoutRun(
  task: Task,
  repositories: Pick<
    ExecutionServiceRepositories,
    "tasksRepository" | "workflowsRepository"
  >,
  now: string,
  updateWorkflowStatusImpl: typeof updateWorkflowStatus,
): Promise<Task> {
  const failedTask: Task = {
    ...task,
    status: "failed",
    updatedAt: now,
  };

  await repositories.tasksRepository.upsert(failedTask);
  await updateWorkflowStatusImpl(task.workflowId, repositories, now);

  return failedTask;
}

async function persistRunAndTaskFailure(
  run: Run,
  task: Task,
  message: string,
  repositories: Pick<
    ExecutionServiceRepositories,
    "runsRepository" | "tasksRepository" | "workflowsRepository"
  >,
  now: string,
  updateWorkflowStatusImpl: typeof updateWorkflowStatus,
): Promise<{ run: Run; task: Task }> {
  const failedRun: Run = {
    ...run,
    status: "failed",
    error: message,
    finishedAt: now,
    updatedAt: now,
  };
  const failedTask: Task = {
    ...task,
    status: "failed",
    updatedAt: now,
  };

  await repositories.runsRepository.upsert(failedRun);
  await repositories.tasksRepository.upsert(failedTask);
  await updateWorkflowStatusImpl(task.workflowId, repositories, now);

  return {
    run: failedRun,
    task: failedTask,
  };
}

export async function executeTaskLifecycle(
  payload: TaskDispatchJobPayload,
  repositories: ExecutionServiceRepositories,
  executableAdapterRegistry: ExecutableAdapterRegistry,
  enqueuePort: DispatchEnqueuePort,
  options: ExecuteTaskLifecycleOptions = {},
): Promise<ExecuteTaskLifecycleResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const createRunId = options.randomUUIDImpl ?? randomUUID;
  const progressDownstreamTasksImpl =
    options.progressDownstreamTasksImpl ?? progressDownstreamTasks;
  const updateWorkflowStatusImpl =
    options.updateWorkflowStatusImpl ?? updateWorkflowStatus;
  const logError =
    options.logError ?? ((message: string) => console.error(message));
  const task = await repositories.tasksRepository.findById(payload.taskId);

  if (!task) {
    logError(
      `Orphaned task dispatch job ${payload.taskId} for workflow ${payload.workflowId}`,
    );

    return {
      ok: false,
      reason: "TASK_NOT_FOUND",
      message: `Task ${payload.taskId} not found for queued job`,
    };
  }

  if (!task.assigneeAgentId) {
    await persistFailedTaskWithoutRun(
      task,
      repositories,
      now(),
      updateWorkflowStatusImpl,
    );

    return {
      ok: false,
      reason: "AGENT_NOT_FOUND",
      message: `Task ${task.taskId} has no assignee agent id`,
    };
  }

  const agent = await repositories.agentsRepository.findById(
    task.assigneeAgentId,
  );

  if (!agent) {
    await persistFailedTaskWithoutRun(
      task,
      repositories,
      now(),
      updateWorkflowStatusImpl,
    );

    return {
      ok: false,
      reason: "AGENT_NOT_FOUND",
      message: `Task ${task.taskId} assignee ${task.assigneeAgentId} not found`,
    };
  }

  const run = createRunForExecution(task, agent.agentId, createRunId(), now());
  const runningTask: Task = {
    ...task,
    status: "running",
    updatedAt: now(),
  };

  await repositories.runsRepository.upsert(run);
  await repositories.tasksRepository.upsert(runningTask);

  const adapter = getExecutionAdapter(
    executableAdapterRegistry,
    agent.runtimeType,
  );

  if (!adapter) {
    await persistRunAndTaskFailure(
      run,
      runningTask,
      `No executable adapter registered for runtime ${agent.runtimeType}`,
      repositories,
      now(),
      updateWorkflowStatusImpl,
    );

    return {
      ok: false,
      reason: "ADAPTER_NOT_FOUND",
      message: `No executable adapter registered for runtime ${agent.runtimeType}`,
    };
  }

  const executionResult = await adapter.execute(runningTask, agent);

  if (!executionResult.ok) {
    await persistRunAndTaskFailure(
      run,
      runningTask,
      executionResult.message,
      repositories,
      now(),
      updateWorkflowStatusImpl,
    );

    return {
      ok: false,
      reason: "EXECUTION_FAILED",
      message: executionResult.message,
    };
  }

  const succeededRun: Run = {
    ...run,
    status: "succeeded",
    output: executionResult.output,
    finishedAt: now(),
    updatedAt: now(),
  };
  const succeededTask: Task = {
    ...runningTask,
    status: "succeeded",
    updatedAt: now(),
  };

  await repositories.runsRepository.upsert(succeededRun);
  await repositories.tasksRepository.upsert(succeededTask);
  await updateWorkflowStatusImpl(task.workflowId, repositories, now());
  await progressDownstreamTasksImpl(succeededTask, repositories, enqueuePort, {
    now,
  });

  return {
    ok: true,
    run: succeededRun,
    task: succeededTask,
  };
}
