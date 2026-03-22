import { randomUUID } from "node:crypto";

import type { LoopDefinition, Run, Task } from "@regisseur/core";
import type { TaskDispatchJobPayload } from "@regisseur/queue-bullmq";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import type {
  AgentsRepositoryLike,
  ExecutableAdapterRegistry,
  LoopDefinitionsRepositoryLike,
  RunsRepositoryLike,
  TaskEdgesRepositoryLike,
  TaskTemplateEdgesRepositoryLike,
  TaskTemplatesRepositoryLike,
  TasksRepositoryLike,
  WorkflowsRepositoryLike,
} from "../types.js";
import { getExecutionAdapter } from "./adapter-registry.js";
import {
  applyDynamicExpansion,
  parseDynamicSpawnDirective,
} from "./dynamic-expansion.js";
import { expandLoopIteration } from "./loop-expansion.js";
import { progressDownstreamTasks } from "./graph-progression.js";
import { updateWorkflowStatus } from "./workflow-status.js";

export interface ExecutionServiceRepositories {
  agentsRepository: AgentsRepositoryLike;
  runsRepository: RunsRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
  loopDefinitionsRepository: LoopDefinitionsRepositoryLike;
  taskTemplatesRepository: TaskTemplatesRepositoryLike;
  taskTemplateEdgesRepository: TaskTemplateEdgesRepositoryLike;
}

export interface ExecuteTaskLifecycleOptions {
  now?: () => string;
  randomUUIDImpl?: () => string;
  applyDynamicExpansionImpl?: typeof applyDynamicExpansion;
  expandLoopIterationImpl?: typeof expandLoopIteration;
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
        | "TASK_CANCELLED"
        | "TASK_NOT_EXECUTABLE"
        | "WORKFLOW_CANCELLED"
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

function resolveLoopAction(
  output: Record<string, unknown> | undefined,
): "repeat" | "exit" {
  return output?.loopAction === "repeat" ? "repeat" : "exit";
}

async function findControllerLoopDefinition(
  task: Task,
  repositories: Pick<ExecutionServiceRepositories, "loopDefinitionsRepository">,
): Promise<LoopDefinition | null> {
  if (!task.loopDefinitionId || !task.taskTemplateId) {
    return null;
  }

  const loopDefinition = await repositories.loopDefinitionsRepository.findById(
    task.loopDefinitionId,
  );

  if (!loopDefinition) {
    return null;
  }

  return loopDefinition.controllerTaskTemplateId === task.taskTemplateId
    ? loopDefinition
    : null;
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

async function persistCancelledTaskWithoutRun(
  task: Task,
  repositories: Pick<
    ExecutionServiceRepositories,
    "tasksRepository" | "workflowsRepository"
  >,
  now: string,
  updateWorkflowStatusImpl: typeof updateWorkflowStatus,
): Promise<Task> {
  const cancelledTask: Task =
    task.status === "cancelled"
      ? task
      : {
          ...task,
          status: "cancelled",
          updatedAt: now,
        };

  if (cancelledTask !== task) {
    await repositories.tasksRepository.upsert(cancelledTask);
  }

  await updateWorkflowStatusImpl(task.workflowId, repositories, now);

  return cancelledTask;
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
  const applyDynamicExpansionImpl =
    options.applyDynamicExpansionImpl ?? applyDynamicExpansion;
  const expandLoopIterationImpl =
    options.expandLoopIterationImpl ?? expandLoopIteration;
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

  if (task.status === "cancelled") {
    return {
      ok: false,
      reason: "TASK_CANCELLED",
      message: `Task ${task.taskId} is cancelled and cannot be executed`,
    };
  }

  if (task.status !== "queued") {
    return {
      ok: false,
      reason: "TASK_NOT_EXECUTABLE",
      message: `Task ${task.taskId} is not queued for execution (status: ${task.status})`,
    };
  }

  const workflow = await repositories.workflowsRepository.findById(
    task.workflowId,
  );

  if (workflow?.status === "cancelled") {
    await persistCancelledTaskWithoutRun(
      task,
      repositories,
      now(),
      updateWorkflowStatusImpl,
    );

    return {
      ok: false,
      reason: "WORKFLOW_CANCELLED",
      message: `Workflow ${task.workflowId} is cancelled; task ${task.taskId} will not execute`,
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
  const latestWorkflow = await repositories.workflowsRepository.findById(
    task.workflowId,
  );
  const controllerLoopDefinition = await findControllerLoopDefinition(
    succeededTask,
    repositories,
  );
  const dynamicSpawnDirectiveResult = parseDynamicSpawnDirective(
    executionResult.output,
  );

  if (!latestWorkflow) {
    return {
      ok: true,
      run: succeededRun,
      task: succeededTask,
    };
  }

  if (latestWorkflow.status === "cancelled") {
    await updateWorkflowStatusImpl(task.workflowId, repositories, now());

    return {
      ok: true,
      run: succeededRun,
      task: succeededTask,
    };
  }

  if (!dynamicSpawnDirectiveResult.ok) {
    await repositories.workflowsRepository.upsert({
      ...latestWorkflow,
      status: "failed",
      updatedAt: now(),
    });

    return {
      ok: true,
      run: succeededRun,
      task: succeededTask,
    };
  }

  const dynamicSpawnDirective = dynamicSpawnDirectiveResult.directive;

  if (!controllerLoopDefinition) {
    if (dynamicSpawnDirective !== null) {
      const dynamicExpansionResult = await applyDynamicExpansionImpl(
        succeededTask,
        latestWorkflow,
        dynamicSpawnDirective,
        repositories,
        enqueuePort,
        {
          now,
          randomUUIDImpl: createRunId,
        },
      );

      if (!dynamicExpansionResult.ok) {
        await repositories.workflowsRepository.upsert({
          ...latestWorkflow,
          status: "failed",
          updatedAt: now(),
        });

        return {
          ok: true,
          run: succeededRun,
          task: succeededTask,
        };
      }
    }

    await progressDownstreamTasksImpl(
      succeededTask,
      repositories,
      enqueuePort,
      {
        now,
      },
    );
    await updateWorkflowStatusImpl(task.workflowId, repositories, now());

    return {
      ok: true,
      run: succeededRun,
      task: succeededTask,
    };
  }

  const loopAction = resolveLoopAction(executionResult.output);

  if (dynamicSpawnDirective !== null) {
    await repositories.workflowsRepository.upsert({
      ...latestWorkflow,
      status: "failed",
      updatedAt: now(),
    });

    return {
      ok: true,
      run: succeededRun,
      task: succeededTask,
    };
  }

  if (loopAction === "repeat") {
    const expansionResult = await expandLoopIterationImpl(
      succeededTask,
      controllerLoopDefinition,
      latestWorkflow,
      repositories,
      enqueuePort,
      {
        now,
        randomUUIDImpl: createRunId,
      },
    );

    if (!expansionResult.ok) {
      await repositories.workflowsRepository.upsert({
        ...latestWorkflow,
        status: "failed",
        updatedAt: now(),
      });

      return {
        ok: true,
        run: succeededRun,
        task: succeededTask,
      };
    }

    await updateWorkflowStatusImpl(task.workflowId, repositories, now());

    return {
      ok: true,
      run: succeededRun,
      task: succeededTask,
    };
  }

  await progressDownstreamTasksImpl(succeededTask, repositories, enqueuePort, {
    now,
  });
  await updateWorkflowStatusImpl(task.workflowId, repositories, now());

  return {
    ok: true,
    run: succeededRun,
    task: succeededTask,
  };
}
