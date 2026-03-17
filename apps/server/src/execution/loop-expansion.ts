import { randomUUID } from "node:crypto";

import {
  evaluateTaskReadiness,
  type LoopDefinition,
  type Task,
  type TaskEdge,
  type TaskTemplate,
  type TaskTemplateEdge,
  type Workflow,
} from "@regisseur/core";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import type {
  AgentsRepositoryLike,
  TaskEdgesRepositoryLike,
  TaskTemplateEdgesRepositoryLike,
  TaskTemplatesRepositoryLike,
  TasksRepositoryLike,
  WorkflowsRepositoryLike,
} from "../types.js";
import {
  selectPersistAndEnqueue,
  type SelectPersistAndEnqueueResult,
} from "./dispatch-persistence.js";

export interface LoopExpansionRepositories {
  agentsRepository: AgentsRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
  taskTemplatesRepository: TaskTemplatesRepositoryLike;
  taskTemplateEdgesRepository: TaskTemplateEdgesRepositoryLike;
}

export interface ExpandLoopIterationOptions {
  now?: () => string;
  randomUUIDImpl?: () => string;
  selectPersistAndEnqueueImpl?: typeof selectPersistAndEnqueue;
}

export interface LoopExpansionFailure {
  taskId: string;
  reason: string;
  message: string;
}

export type ExpandLoopIterationResult =
  | {
      ok: true;
      createdTaskIds: string[];
      enqueuedTaskIds: string[];
      failures: LoopExpansionFailure[];
    }
  | {
      ok: false;
      reason: "LOOP_MAX_ITERATIONS_EXCEEDED";
      message: string;
    };

function createLoopTask(
  workflowId: string,
  taskTemplate: TaskTemplate,
  taskId: string,
  loopDefinitionId: string,
  iteration: number,
  spawnedFromTaskId: string,
  now: string,
): Task {
  return {
    taskId,
    workflowId,
    title: taskTemplate.title,
    payload: { ...taskTemplate.payload },
    status: "blocked",
    retryCount: taskTemplate.retryCount,
    taskTemplateId: taskTemplate.taskTemplateId,
    loopDefinitionId,
    iteration,
    spawnedFromTaskId,
    ...(taskTemplate.defaultAssigneeAgentId !== undefined
      ? { assigneeAgentId: taskTemplate.defaultAssigneeAgentId }
      : {}),
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

function createTaskEdge(
  fromTaskId: string,
  toTaskId: string,
  type: TaskEdge["type"] = "depends_on",
): TaskEdge {
  return {
    fromTaskId,
    toTaskId,
    type,
  };
}

function edgeKey(edge: TaskEdge): string {
  return `${edge.fromTaskId}:${edge.toTaskId}:${edge.type}`;
}

function createTaskLookup(tasks: readonly Task[]): ReadonlyMap<string, Task> {
  return new Map(tasks.map((task) => [task.taskId, task]));
}

function createTaskTemplateLookup(
  taskTemplates: readonly TaskTemplate[],
): ReadonlyMap<string, TaskTemplate> {
  return new Map(
    taskTemplates.map((taskTemplate) => [
      taskTemplate.taskTemplateId,
      taskTemplate,
    ]),
  );
}

function createBodyTaskEdgeCopies(
  bodyEdges: readonly TaskTemplateEdge[],
  taskIdByTemplateId: ReadonlyMap<string, string>,
): TaskEdge[] {
  return bodyEdges.map((bodyEdge) =>
    createTaskEdge(
      taskIdByTemplateId.get(bodyEdge.fromTaskTemplateId)!,
      taskIdByTemplateId.get(bodyEdge.toTaskTemplateId)!,
      bodyEdge.type,
    ),
  );
}

function findExternalDownstreamTasks(
  controllerTask: Task,
  allTasks: readonly Task[],
  existingEdges: readonly TaskEdge[],
  loopDefinitionId: string,
): Task[] {
  const taskLookup = createTaskLookup(allTasks);

  return existingEdges
    .filter((edge) => edge.fromTaskId === controllerTask.taskId)
    .map((edge) => taskLookup.get(edge.toTaskId))
    .filter((task): task is Task => task !== undefined)
    .filter((task) => task.loopDefinitionId !== loopDefinitionId);
}

export async function expandLoopIteration(
  controllerTask: Task,
  loopDefinition: LoopDefinition,
  workflow: Workflow,
  repositories: LoopExpansionRepositories,
  enqueuePort: DispatchEnqueuePort,
  options: ExpandLoopIterationOptions = {},
): Promise<ExpandLoopIterationResult> {
  const currentIteration = controllerTask.iteration ?? 1;

  if (currentIteration >= loopDefinition.maxIterations) {
    return {
      ok: false,
      reason: "LOOP_MAX_ITERATIONS_EXCEEDED",
      message: `Loop ${loopDefinition.loopDefinitionId} exceeded maxIterations=${loopDefinition.maxIterations}`,
    };
  }

  const now = options.now ?? (() => new Date().toISOString());
  const randomUUIDImpl = options.randomUUIDImpl ?? randomUUID;
  const selectPersistAndEnqueueImpl =
    options.selectPersistAndEnqueueImpl ?? selectPersistAndEnqueue;
  const timestamp = now();
  const nextIteration = currentIteration + 1;
  const [allWorkflowTasks, workflowTaskTemplates, bodyEdges, allAgents] =
    await Promise.all([
      repositories.tasksRepository.findByWorkflowId(workflow.workflowId),
      repositories.taskTemplatesRepository.findByWorkflowDefinitionId(
        workflow.workflowDefinitionId!,
      ),
      repositories.taskTemplateEdgesRepository.findAllByWorkflowDefinitionTaskTemplates(
        loopDefinition.bodyTaskTemplateIds,
      ),
      repositories.agentsRepository.findAll(),
    ]);
  const allWorkflowTaskIds = allWorkflowTasks.map((task) => task.taskId);
  const existingRuntimeEdges =
    allWorkflowTaskIds.length === 0
      ? []
      : await repositories.taskEdgesRepository.findAllByWorkflowTasks(
          allWorkflowTaskIds,
        );
  const taskTemplateLookup = createTaskTemplateLookup(workflowTaskTemplates);
  const bodyTaskTemplates = loopDefinition.bodyTaskTemplateIds.map(
    (taskTemplateId) => taskTemplateLookup.get(taskTemplateId)!,
  );
  const taskIdByTemplateId = new Map<string, string>();
  const newTasks = bodyTaskTemplates.map((taskTemplate) => {
    const taskId = randomUUIDImpl();

    taskIdByTemplateId.set(taskTemplate.taskTemplateId, taskId);

    return createLoopTask(
      workflow.workflowId,
      taskTemplate,
      taskId,
      loopDefinition.loopDefinitionId,
      nextIteration,
      controllerTask.taskId,
      timestamp,
    );
  });
  const nextControllerTaskId = taskIdByTemplateId.get(
    loopDefinition.controllerTaskTemplateId,
  )!;
  const nextEntryEdges = loopDefinition.entryTaskTemplateIds.map(
    (entryTaskTemplateId) =>
      createTaskEdge(
        controllerTask.taskId,
        taskIdByTemplateId.get(entryTaskTemplateId)!,
      ),
  );
  const externalDownstreamTasks = findExternalDownstreamTasks(
    controllerTask,
    allWorkflowTasks,
    existingRuntimeEdges,
    loopDefinition.loopDefinitionId,
  );
  const externalDownstreamEdges = externalDownstreamTasks.map((externalTask) =>
    createTaskEdge(nextControllerTaskId, externalTask.taskId),
  );
  const existingEdgeKeys = new Set(existingRuntimeEdges.map(edgeKey));
  const newEdges = [
    ...createBodyTaskEdgeCopies(bodyEdges, taskIdByTemplateId),
    ...nextEntryEdges,
    ...externalDownstreamEdges,
  ].filter((edge) => {
    const key = edgeKey(edge);

    if (existingEdgeKeys.has(key)) {
      return false;
    }

    existingEdgeKeys.add(key);
    return true;
  });

  for (const task of newTasks) {
    await repositories.tasksRepository.upsert(task);
  }

  if (newEdges.length > 0) {
    await repositories.taskEdgesRepository.insertMany(newEdges);
  }

  const combinedTasks = [...allWorkflowTasks, ...newTasks];
  const combinedEdges = [...existingRuntimeEdges, ...newEdges];
  const entryTasks = newTasks.filter((task) =>
    loopDefinition.entryTaskTemplateIds.includes(task.taskTemplateId!),
  );
  const enqueuedTaskIds: string[] = [];
  const failures: LoopExpansionFailure[] = [];

  for (const entryTask of entryTasks) {
    const readiness = evaluateTaskReadiness(
      entryTask,
      combinedTasks,
      combinedEdges,
    );

    if (!readiness.canBecomeReady) {
      continue;
    }

    const result: SelectPersistAndEnqueueResult =
      await selectPersistAndEnqueueImpl(
        entryTask,
        allAgents,
        {
          tasksRepository: repositories.tasksRepository,
          workflowsRepository: repositories.workflowsRepository,
        },
        enqueuePort,
        {
          triggerSource: "internal",
          requestedAt: timestamp,
          selectionFailureMode: "fail_task",
          now: () => timestamp,
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
  }

  return {
    ok: true,
    createdTaskIds: newTasks.map((task) => task.taskId),
    enqueuedTaskIds,
    failures,
  };
}
