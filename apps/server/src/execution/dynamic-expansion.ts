import { randomUUID } from "node:crypto";

import {
  TASK_EDGE_TYPES,
  evaluateTaskReadiness,
  isTerminalWorkflowStatus,
  type Task,
  type TaskEdge,
  type Workflow,
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

export const PER_COMPLETION_DYNAMIC_TASK_LIMIT = 20;
export const WORKFLOW_DYNAMIC_TASK_LIMIT = 200;

export interface DynamicSpawnTaskInput {
  taskKey: string;
  title: string;
  payload: Record<string, unknown>;
  defaultAssigneeAgentId?: string;
  retryCount: number;
  concurrencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface DynamicSpawnEdgeInput {
  from: string;
  to: string;
  type: TaskEdge["type"];
}

export interface DynamicSpawnDirective {
  tasks: DynamicSpawnTaskInput[];
  edges: DynamicSpawnEdgeInput[];
}

export interface DynamicExpansionRepositories {
  agentsRepository: AgentsRepositoryLike;
  runsRepository: RunsRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
}

export interface DynamicExpansionFailure {
  taskId: string;
  reason: string;
  message: string;
}

export interface ApplyDynamicExpansionOptions {
  now?: () => string;
  randomUUIDImpl?: () => string;
  selectPersistAndEnqueueImpl?: typeof selectPersistAndEnqueue;
}

export type ParseDynamicSpawnDirectiveResult =
  | {
      ok: true;
      directive: DynamicSpawnDirective | null;
    }
  | {
      ok: false;
      reason: "INVALID_DYNAMIC_SPAWN_DIRECTIVE";
      message: string;
    };

export type ApplyDynamicExpansionResult =
  | {
      ok: true;
      applied: boolean;
      createdTaskIds: string[];
      enqueuedTaskIds: string[];
      failures: DynamicExpansionFailure[];
    }
  | {
      ok: false;
      reason:
        | "INVALID_DYNAMIC_SPAWN_DIRECTIVE"
        | "TERMINAL_WORKFLOW"
        | "PER_COMPLETION_DYNAMIC_TASK_LIMIT_EXCEEDED"
        | "WORKFLOW_DYNAMIC_TASK_LIMIT_EXCEEDED"
        | "INVALID_DYNAMIC_SPAWN_EDGE"
        | "DYNAMIC_SPAWN_SUBGRAPH_CYCLE";
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createInvalidDirectiveResult(
  message: string,
): ParseDynamicSpawnDirectiveResult {
  return {
    ok: false,
    reason: "INVALID_DYNAMIC_SPAWN_DIRECTIVE",
    message,
  };
}

function parseSpawnTask(
  value: unknown,
  index: number,
): DynamicSpawnTaskInput | ParseDynamicSpawnDirectiveResult {
  if (!isRecord(value)) {
    return createInvalidDirectiveResult(
      `spawn.tasks[${index}] must be an object`,
    );
  }

  if (typeof value.taskKey !== "string" || value.taskKey.length === 0) {
    return createInvalidDirectiveResult(
      `spawn.tasks[${index}].taskKey must be a non-empty string`,
    );
  }

  if (typeof value.title !== "string" || value.title.length === 0) {
    return createInvalidDirectiveResult(
      `spawn.tasks[${index}].title must be a non-empty string`,
    );
  }

  if (!isRecord(value.payload)) {
    return createInvalidDirectiveResult(
      `spawn.tasks[${index}].payload must be an object`,
    );
  }

  if (
    typeof value.retryCount !== "number" ||
    Number.isNaN(value.retryCount) ||
    value.retryCount < 0
  ) {
    return createInvalidDirectiveResult(
      `spawn.tasks[${index}].retryCount must be a non-negative number`,
    );
  }

  if (
    value.defaultAssigneeAgentId !== undefined &&
    typeof value.defaultAssigneeAgentId !== "string"
  ) {
    return createInvalidDirectiveResult(
      `spawn.tasks[${index}].defaultAssigneeAgentId must be a string`,
    );
  }

  if (
    value.concurrencyKey !== undefined &&
    typeof value.concurrencyKey !== "string"
  ) {
    return createInvalidDirectiveResult(
      `spawn.tasks[${index}].concurrencyKey must be a string`,
    );
  }

  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    return createInvalidDirectiveResult(
      `spawn.tasks[${index}].metadata must be an object`,
    );
  }

  return {
    taskKey: value.taskKey,
    title: value.title,
    payload: { ...value.payload },
    retryCount: value.retryCount,
    ...(value.defaultAssigneeAgentId !== undefined
      ? { defaultAssigneeAgentId: value.defaultAssigneeAgentId }
      : {}),
    ...(value.concurrencyKey !== undefined
      ? { concurrencyKey: value.concurrencyKey }
      : {}),
    ...(value.metadata !== undefined
      ? { metadata: { ...value.metadata } }
      : {}),
  };
}

function parseSpawnEdge(
  value: unknown,
  index: number,
): DynamicSpawnEdgeInput | ParseDynamicSpawnDirectiveResult {
  if (!isRecord(value)) {
    return createInvalidDirectiveResult(
      `spawn.edges[${index}] must be an object`,
    );
  }

  if (typeof value.from !== "string" || value.from.length === 0) {
    return createInvalidDirectiveResult(
      `spawn.edges[${index}].from must be a non-empty string`,
    );
  }

  if (typeof value.to !== "string" || value.to.length === 0) {
    return createInvalidDirectiveResult(
      `spawn.edges[${index}].to must be a non-empty string`,
    );
  }

  if (
    value.type !== undefined &&
    !TASK_EDGE_TYPES.includes(value.type as TaskEdge["type"])
  ) {
    return createInvalidDirectiveResult(
      `spawn.edges[${index}].type must be one of ${TASK_EDGE_TYPES.join(", ")}`,
    );
  }

  return {
    from: value.from,
    to: value.to,
    type: (value.type as TaskEdge["type"] | undefined) ?? "depends_on",
  };
}

function detectSpawnCycle(edges: readonly DynamicSpawnEdgeInput[]): boolean {
  const adjacency = new Map<string, string[]>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  for (const edge of edges) {
    const next = adjacency.get(edge.from);

    if (next) {
      next.push(edge.to);
      continue;
    }

    adjacency.set(edge.from, [edge.to]);
  }

  function visit(node: string): boolean {
    if (visiting.has(node)) {
      return true;
    }

    if (visited.has(node)) {
      return false;
    }

    visiting.add(node);

    for (const nextNode of adjacency.get(node) ?? []) {
      if (visit(nextNode)) {
        return true;
      }
    }

    visiting.delete(node);
    visited.add(node);

    return false;
  }

  for (const node of adjacency.keys()) {
    if (visit(node)) {
      return true;
    }
  }

  return false;
}

function edgeKey(edge: TaskEdge): string {
  return `${edge.fromTaskId}:${edge.toTaskId}:${edge.type}`;
}

function createDynamicTask(
  taskId: string,
  workflowId: string,
  spawnedFromTaskId: string,
  spec: DynamicSpawnTaskInput,
  status: Task["status"],
  now: string,
): Task {
  return {
    taskId,
    workflowId,
    title: spec.title,
    payload: { ...spec.payload },
    status,
    ...(spec.defaultAssigneeAgentId !== undefined
      ? { assigneeAgentId: spec.defaultAssigneeAgentId }
      : {}),
    retryCount: spec.retryCount,
    spawnedFromTaskId,
    generationSource: "dynamic",
    ...(spec.concurrencyKey !== undefined
      ? { concurrencyKey: spec.concurrencyKey }
      : {}),
    ...(spec.metadata !== undefined ? { metadata: { ...spec.metadata } } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function parseDynamicSpawnDirective(
  output: Record<string, unknown> | undefined,
): ParseDynamicSpawnDirectiveResult {
  if (output === undefined) {
    return {
      ok: true,
      directive: null,
    };
  }

  const orchestration = output.orchestration;

  if (orchestration === undefined) {
    return {
      ok: true,
      directive: null,
    };
  }

  if (!isRecord(orchestration)) {
    return createInvalidDirectiveResult("orchestration must be an object");
  }

  const spawn = orchestration.spawn;

  if (spawn === undefined) {
    return {
      ok: true,
      directive: null,
    };
  }

  if (!isRecord(spawn)) {
    return createInvalidDirectiveResult(
      "orchestration.spawn must be an object",
    );
  }

  if (!Array.isArray(spawn.tasks) || spawn.tasks.length === 0) {
    return createInvalidDirectiveResult(
      "orchestration.spawn.tasks must be a non-empty array",
    );
  }

  const tasks: DynamicSpawnTaskInput[] = [];
  const taskKeys = new Set<string>();

  for (const [index, taskValue] of spawn.tasks.entries()) {
    const parsedTask = parseSpawnTask(taskValue, index);

    if ("ok" in parsedTask) {
      return parsedTask;
    }

    if (taskKeys.has(parsedTask.taskKey)) {
      return createInvalidDirectiveResult(
        `spawn.tasks contains duplicate taskKey ${parsedTask.taskKey}`,
      );
    }

    taskKeys.add(parsedTask.taskKey);
    tasks.push(parsedTask);
  }

  if (spawn.edges !== undefined && !Array.isArray(spawn.edges)) {
    return createInvalidDirectiveResult(
      "orchestration.spawn.edges must be an array",
    );
  }

  const edges: DynamicSpawnEdgeInput[] = [];

  for (const [index, edgeValue] of (spawn.edges ?? []).entries()) {
    const parsedEdge = parseSpawnEdge(edgeValue, index);

    if ("ok" in parsedEdge) {
      return parsedEdge;
    }

    edges.push(parsedEdge);
  }

  return {
    ok: true,
    directive: {
      tasks,
      edges,
    },
  };
}

export async function applyDynamicExpansion(
  currentTask: Task,
  workflow: Workflow,
  directive: DynamicSpawnDirective,
  repositories: DynamicExpansionRepositories,
  enqueuePort: DispatchEnqueuePort,
  options: ApplyDynamicExpansionOptions = {},
): Promise<ApplyDynamicExpansionResult> {
  if (isTerminalWorkflowStatus(workflow.status)) {
    return {
      ok: false,
      reason: "TERMINAL_WORKFLOW",
      message: `Workflow ${workflow.workflowId} is terminal and cannot accept dynamic expansion`,
    };
  }

  if (directive.tasks.length > PER_COMPLETION_DYNAMIC_TASK_LIMIT) {
    return {
      ok: false,
      reason: "PER_COMPLETION_DYNAMIC_TASK_LIMIT_EXCEEDED",
      message: `Dynamic spawn exceeds per-completion limit ${PER_COMPLETION_DYNAMIC_TASK_LIMIT}`,
    };
  }

  const existingDynamicTaskCount =
    await repositories.tasksRepository.countByWorkflowIdAndGenerationSource(
      workflow.workflowId,
      "dynamic",
    );

  if (
    existingDynamicTaskCount + directive.tasks.length >
    WORKFLOW_DYNAMIC_TASK_LIMIT
  ) {
    return {
      ok: false,
      reason: "WORKFLOW_DYNAMIC_TASK_LIMIT_EXCEEDED",
      message: `Workflow ${workflow.workflowId} exceeds dynamic task limit ${WORKFLOW_DYNAMIC_TASK_LIMIT}`,
    };
  }

  const taskKeys = new Set(directive.tasks.map((task) => task.taskKey));

  for (const edge of directive.edges) {
    if (edge.from !== currentTask.taskId && !taskKeys.has(edge.from)) {
      return {
        ok: false,
        reason: "INVALID_DYNAMIC_SPAWN_EDGE",
        message: `Dynamic spawn edge source ${edge.from} must be the current task id or a spawned taskKey`,
      };
    }

    if (!taskKeys.has(edge.to)) {
      return {
        ok: false,
        reason: "INVALID_DYNAMIC_SPAWN_EDGE",
        message: `Dynamic spawn edge target ${edge.to} must reference a spawned taskKey`,
      };
    }
  }

  const spawnedSubgraphEdges = directive.edges.filter(
    (edge) => taskKeys.has(edge.from) && taskKeys.has(edge.to),
  );

  if (detectSpawnCycle(spawnedSubgraphEdges)) {
    return {
      ok: false,
      reason: "DYNAMIC_SPAWN_SUBGRAPH_CYCLE",
      message: "Dynamic spawned subgraph must remain acyclic",
    };
  }

  const now = options.now ?? (() => new Date().toISOString());
  const randomUUIDImpl = options.randomUUIDImpl ?? randomUUID;
  const selectPersistAndEnqueueImpl =
    options.selectPersistAndEnqueueImpl ?? selectPersistAndEnqueue;
  const timestamp = now();
  const [workflowTasks, allAgents] = await Promise.all([
    repositories.tasksRepository.findByWorkflowId(workflow.workflowId),
    repositories.agentsRepository.findAll(),
  ]);
  const existingEdges =
    workflowTasks.length === 0
      ? []
      : await repositories.taskEdgesRepository.findAllByWorkflowTasks(
          workflowTasks.map((task) => task.taskId),
        );
  const taskIdByKey = new Map<string, string>();

  for (const task of directive.tasks) {
    taskIdByKey.set(task.taskKey, randomUUIDImpl());
  }

  const incomingEdgeCount = new Map<string, number>();

  for (const edge of directive.edges) {
    incomingEdgeCount.set(edge.to, (incomingEdgeCount.get(edge.to) ?? 0) + 1);
  }

  const spawnedTasks = directive.tasks.map((task) =>
    createDynamicTask(
      taskIdByKey.get(task.taskKey)!,
      workflow.workflowId,
      currentTask.taskId,
      task,
      (incomingEdgeCount.get(task.taskKey) ?? 0) === 0 ? "ready" : "blocked",
      timestamp,
    ),
  );
  const existingEdgeKeys = new Set(existingEdges.map(edgeKey));
  const spawnedEdges = directive.edges
    .map((edge) => ({
      fromTaskId:
        edge.from === currentTask.taskId
          ? currentTask.taskId
          : taskIdByKey.get(edge.from)!,
      toTaskId: taskIdByKey.get(edge.to)!,
      type: edge.type,
    }))
    .filter((edge) => {
      const key = edgeKey(edge);

      if (existingEdgeKeys.has(key)) {
        return false;
      }

      existingEdgeKeys.add(key);
      return true;
    });

  for (const task of spawnedTasks) {
    await repositories.tasksRepository.upsert(task);
  }

  if (spawnedEdges.length > 0) {
    await repositories.taskEdgesRepository.insertMany(spawnedEdges);
  }

  const combinedTasks = [...workflowTasks, ...spawnedTasks];
  const combinedEdges = [...existingEdges, ...spawnedEdges];
  const enqueuedTaskIds: string[] = [];
  const failures: DynamicExpansionFailure[] = [];

  for (const spawnedTask of spawnedTasks) {
    const readiness = evaluateTaskReadiness(
      spawnedTask,
      combinedTasks,
      combinedEdges,
    );

    if (!readiness.isReady) {
      continue;
    }

    const injectedSpawnedTask = await injectUpstreamOutputs(
      spawnedTask,
      combinedEdges,
      repositories.runsRepository,
    );
    const result: SelectPersistAndEnqueueResult =
      await selectPersistAndEnqueueImpl(
        injectedSpawnedTask,
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
    applied: true,
    createdTaskIds: spawnedTasks.map((task) => task.taskId),
    enqueuedTaskIds,
    failures,
  };
}
