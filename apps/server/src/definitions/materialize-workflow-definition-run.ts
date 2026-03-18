import { randomUUID } from "node:crypto";

import type {
  DispatchTriggerSource,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
} from "@regisseur/core";

import { conflict, notFound } from "../errors/http-error.js";
import {
  selectPersistAndEnqueue,
  type SelectPersistAndEnqueueResult,
} from "../execution/dispatch-persistence.js";
import type {
  AgentsRepositoryLike,
  LoopDefinitionsRepositoryLike,
  TaskEdgesRepositoryLike,
  TaskTemplateEdgesRepositoryLike,
  TaskTemplatesRepositoryLike,
  TasksRepositoryLike,
  WorkflowDefinitionsRepositoryLike,
  WorkflowsRepositoryLike,
} from "../types.js";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

export interface MaterializeWorkflowDefinitionRunRepositories {
  agentsRepository: AgentsRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  workflowDefinitionsRepository: WorkflowDefinitionsRepositoryLike;
  taskTemplatesRepository: TaskTemplatesRepositoryLike;
  taskTemplateEdgesRepository: TaskTemplateEdgesRepositoryLike;
  loopDefinitionsRepository: LoopDefinitionsRepositoryLike;
}

export interface MaterializeWorkflowDefinitionRunOptions {
  triggerSource: DispatchTriggerSource;
  scheduleId?: string;
  requestedAt?: string;
  now?: () => string;
  randomUUIDImpl?: () => string;
  selectPersistAndEnqueueImpl?: typeof selectPersistAndEnqueue;
}

export interface MaterializeWorkflowDefinitionRunResult {
  workflow: Workflow;
  tasks: Task[];
  taskEdges: TaskEdge[];
  createdTaskIds: string[];
  enqueuedTaskIds: string[];
  selectionFailures: Extract<SelectPersistAndEnqueueResult, { ok: false }>[];
}

function getRootTaskTemplateIds(
  taskTemplates: readonly TaskTemplate[],
  taskTemplateEdges: readonly TaskTemplateEdge[],
): Set<string> {
  const dependentTaskTemplateIds = new Set(
    taskTemplateEdges.map(
      (taskTemplateEdge) => taskTemplateEdge.toTaskTemplateId,
    ),
  );

  return new Set(
    taskTemplates
      .filter(
        (taskTemplate) =>
          !dependentTaskTemplateIds.has(taskTemplate.taskTemplateId),
      )
      .map((taskTemplate) => taskTemplate.taskTemplateId),
  );
}

function createRuntimeWorkflow(
  workflowId: string,
  workflowDefinitionId: string,
  name: string,
  triggerSource: DispatchTriggerSource,
  now: string,
  options: MaterializeWorkflowDefinitionRunOptions,
  metadata?: Record<string, unknown>,
): Workflow {
  return {
    workflowId,
    name,
    status: "pending",
    workflowDefinitionId,
    triggerSource,
    ...(options.scheduleId !== undefined
      ? { triggeredByScheduleId: options.scheduleId }
      : {}),
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function createRuntimeTask(
  taskId: string,
  workflowId: string,
  taskTemplate: TaskTemplate,
  isRootTask: boolean,
  now: string,
  loopDefinitionId?: string,
  iteration?: number,
): Task {
  return {
    taskId,
    workflowId,
    title: taskTemplate.title,
    payload: { ...taskTemplate.payload },
    status: isRootTask ? "ready" : "blocked",
    ...(taskTemplate.defaultAssigneeAgentId !== undefined
      ? { assigneeAgentId: taskTemplate.defaultAssigneeAgentId }
      : {}),
    retryCount: taskTemplate.retryCount,
    taskTemplateId: taskTemplate.taskTemplateId,
    generationSource: "definition",
    ...(loopDefinitionId !== undefined ? { loopDefinitionId } : {}),
    ...(iteration !== undefined ? { iteration } : {}),
    ...(taskTemplate.concurrencyKey !== undefined
      ? { concurrencyKey: taskTemplate.concurrencyKey }
      : {}),
    ...(taskTemplate.metadata !== undefined
      ? { metadata: { ...taskTemplate.metadata } }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function createRuntimeTaskEdge(
  taskTemplateEdge: TaskTemplateEdge,
  taskIdByTemplateId: ReadonlyMap<string, string>,
): TaskEdge {
  return {
    fromTaskId: taskIdByTemplateId.get(taskTemplateEdge.fromTaskTemplateId)!,
    toTaskId: taskIdByTemplateId.get(taskTemplateEdge.toTaskTemplateId)!,
    type: taskTemplateEdge.type,
    ...(taskTemplateEdge.injectOutput === true ? { injectOutput: true } : {}),
    ...(taskTemplateEdge.outputMergeKey !== undefined
      ? { outputMergeKey: taskTemplateEdge.outputMergeKey }
      : {}),
  };
}

export async function materializeWorkflowDefinitionRun(
  workflowDefinitionId: string,
  repositories: MaterializeWorkflowDefinitionRunRepositories,
  enqueuePort: DispatchEnqueuePort,
  options: MaterializeWorkflowDefinitionRunOptions,
): Promise<MaterializeWorkflowDefinitionRunResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const materializedAt = now();
  const runtimeId = options.randomUUIDImpl ?? randomUUID;
  const selectPersistAndEnqueueImpl =
    options.selectPersistAndEnqueueImpl ?? selectPersistAndEnqueue;
  const workflowDefinition =
    await repositories.workflowDefinitionsRepository.findById(
      workflowDefinitionId,
    );

  if (!workflowDefinition) {
    throw notFound(`Workflow definition ${workflowDefinitionId} not found`);
  }

  if (!workflowDefinition.enabled) {
    throw conflict(
      "WORKFLOW_DEFINITION_DISABLED",
      `Workflow definition ${workflowDefinitionId} is disabled`,
    );
  }

  const taskTemplates =
    await repositories.taskTemplatesRepository.findByWorkflowDefinitionId(
      workflowDefinitionId,
    );

  if (taskTemplates.length === 0) {
    throw conflict(
      "EMPTY_WORKFLOW_DEFINITION",
      `Workflow definition ${workflowDefinitionId} has no task templates`,
    );
  }

  const taskTemplateEdges =
    await repositories.taskTemplateEdgesRepository.findAllByWorkflowDefinitionTaskTemplates(
      taskTemplates.map((taskTemplate) => taskTemplate.taskTemplateId),
    );
  const loopDefinition =
    await repositories.loopDefinitionsRepository.findByWorkflowDefinitionId(
      workflowDefinitionId,
    );
  const workflowId = runtimeId();
  const workflow = createRuntimeWorkflow(
    workflowId,
    workflowDefinition.workflowDefinitionId,
    workflowDefinition.name,
    options.triggerSource,
    materializedAt,
    options,
    workflowDefinition.metadata,
  );
  const rootTaskTemplateIds = getRootTaskTemplateIds(
    taskTemplates,
    taskTemplateEdges,
  );
  const loopBodyTaskTemplateIds = new Set(
    loopDefinition?.bodyTaskTemplateIds ?? [],
  );
  const taskIdByTemplateId = new Map<string, string>();
  const tasks = taskTemplates.map((taskTemplate) => {
    const taskId = runtimeId();

    taskIdByTemplateId.set(taskTemplate.taskTemplateId, taskId);

    return createRuntimeTask(
      taskId,
      workflowId,
      taskTemplate,
      rootTaskTemplateIds.has(taskTemplate.taskTemplateId),
      materializedAt,
      loopBodyTaskTemplateIds.has(taskTemplate.taskTemplateId)
        ? loopDefinition?.loopDefinitionId
        : undefined,
      loopBodyTaskTemplateIds.has(taskTemplate.taskTemplateId) ? 1 : undefined,
    );
  });
  const taskEdges = taskTemplateEdges.map((taskTemplateEdge) =>
    createRuntimeTaskEdge(taskTemplateEdge, taskIdByTemplateId),
  );

  await repositories.workflowsRepository.upsert(workflow);

  for (const task of tasks) {
    await repositories.tasksRepository.upsert(task);
  }

  if (taskEdges.length > 0) {
    await repositories.taskEdgesRepository.insertMany(taskEdges);
  }

  const allAgents = await repositories.agentsRepository.findAll();
  const readyTasks = tasks.filter((task) => task.status === "ready");
  const enqueuedTaskIds: string[] = [];
  const selectionFailures: Extract<
    SelectPersistAndEnqueueResult,
    { ok: false }
  >[] = [];

  for (const readyTask of readyTasks) {
    const result = await selectPersistAndEnqueueImpl(
      readyTask,
      allAgents,
      {
        tasksRepository: repositories.tasksRepository,
        workflowsRepository: repositories.workflowsRepository,
      },
      enqueuePort,
      {
        triggerSource: options.triggerSource,
        requestedAt: options.requestedAt ?? materializedAt,
        selectionFailureMode: "fail_task",
        now: () => materializedAt,
      },
    );

    if (result.ok) {
      enqueuedTaskIds.push(result.taskId);
      continue;
    }

    if (result.reason === "ENQUEUE_FAILED") {
      throw new Error(result.message);
    }

    selectionFailures.push(result);
  }

  const persistedWorkflow =
    (await repositories.workflowsRepository.findById(workflowId)) ?? workflow;

  return {
    workflow: persistedWorkflow,
    tasks,
    taskEdges,
    createdTaskIds: tasks.map((task) => task.taskId),
    enqueuedTaskIds,
    selectionFailures,
  };
}
