import type {
  AgentDefinition,
  LoopDefinition,
  Schedule,
  TaskTemplate,
  TaskTemplateEdge,
  WorkflowDefinition,
} from "@regisseur/core";

import { createId, createTimestamp } from "./ids";

export interface PreflightFinding {
  code: string;
  severity: "error" | "warning";
  message: string;
}

export interface WorkflowDefinitionBundle {
  schemaVersion: 1;
  exportedAt: string;
  definition: WorkflowDefinition;
  taskTemplates: TaskTemplate[];
  edges: TaskTemplateEdge[];
  loop: LoopDefinition | null;
  schedules: Schedule[];
}

export function countDefinitionRoots(
  taskTemplates: readonly TaskTemplate[],
  edges: readonly TaskTemplateEdge[],
): number {
  const blocked = new Set(edges.map((edge) => edge.toTaskTemplateId));

  return taskTemplates.filter((taskTemplate) => !blocked.has(taskTemplate.taskTemplateId)).length;
}

export function buildWorkflowDefinitionBundle(input: {
  definition: WorkflowDefinition;
  taskTemplates?: readonly TaskTemplate[];
  edges?: readonly TaskTemplateEdge[];
  loop?: LoopDefinition | null;
  schedules?: readonly Schedule[];
}): WorkflowDefinitionBundle {
  return {
    schemaVersion: 1,
    exportedAt: createTimestamp(),
    definition: input.definition,
    taskTemplates: [...(input.taskTemplates ?? [])],
    edges: [...(input.edges ?? [])],
    loop: input.loop ?? null,
    schedules: [...(input.schedules ?? [])],
  };
}

export function parseWorkflowDefinitionImport(value: unknown): WorkflowDefinitionBundle {
  const payload = expectRecord(value, "import payload");

  if ("definition" in payload) {
    const definition = expectWorkflowDefinition(payload.definition);
    return {
      schemaVersion: 1,
      exportedAt:
        typeof payload.exportedAt === "string" ? payload.exportedAt : createTimestamp(),
      definition,
      taskTemplates: expectTaskTemplates(payload.taskTemplates),
      edges: expectTaskTemplateEdges(payload.edges),
      loop: expectLoopDefinition(payload.loop),
      schedules: expectSchedules(payload.schedules),
    };
  }

  return buildWorkflowDefinitionBundle({
    definition: expectWorkflowDefinition(payload),
  });
}

export function cloneWorkflowDefinitionBundle(
  bundle: WorkflowDefinitionBundle,
  options?: {
    nameSuffix?: string;
  },
): WorkflowDefinitionBundle {
  const timestamp = createTimestamp();
  const workflowDefinitionId = createId("workflow-definition");
  const taskTemplateIds = new Map<string, string>();

  bundle.taskTemplates.forEach((taskTemplate) => {
    taskTemplateIds.set(taskTemplate.taskTemplateId, createId("task-template"));
  });

  const definition: WorkflowDefinition = {
    ...bundle.definition,
    workflowDefinitionId,
    name: withNameSuffix(bundle.definition.name, options?.nameSuffix ?? "Copy"),
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: {
      ...(bundle.definition.metadata ?? {}),
      clonedFromWorkflowDefinitionId: bundle.definition.workflowDefinitionId,
    },
  };

  const taskTemplates = bundle.taskTemplates.map<TaskTemplate>((taskTemplate) => ({
    ...taskTemplate,
    taskTemplateId: taskTemplateIds.get(taskTemplate.taskTemplateId) ?? createId("task-template"),
    workflowDefinitionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const edges = bundle.edges.map<TaskTemplateEdge>((edge) => ({
    ...edge,
    fromTaskTemplateId:
      taskTemplateIds.get(edge.fromTaskTemplateId) ?? edge.fromTaskTemplateId,
    toTaskTemplateId: taskTemplateIds.get(edge.toTaskTemplateId) ?? edge.toTaskTemplateId,
  }));

  const loop = bundle.loop
    ? {
        ...bundle.loop,
        loopDefinitionId: createId("loop"),
        workflowDefinitionId,
        controllerTaskTemplateId:
          taskTemplateIds.get(bundle.loop.controllerTaskTemplateId) ??
          bundle.loop.controllerTaskTemplateId,
        entryTaskTemplateIds: bundle.loop.entryTaskTemplateIds.map(
          (taskTemplateId) => taskTemplateIds.get(taskTemplateId) ?? taskTemplateId,
        ),
        bodyTaskTemplateIds: bundle.loop.bodyTaskTemplateIds.map(
          (taskTemplateId) => taskTemplateIds.get(taskTemplateId) ?? taskTemplateId,
        ),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    : null;

  const schedules = bundle.schedules.map<Schedule>((schedule) => ({
    ...schedule,
    scheduleId: createId("schedule"),
    targetId: workflowDefinitionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  return {
    schemaVersion: 1,
    exportedAt: timestamp,
    definition,
    taskTemplates,
    edges,
    loop,
    schedules,
  };
}

export function workflowDefinitionStartPreflight(input: {
  definition: WorkflowDefinition;
  taskTemplates: readonly TaskTemplate[];
  edges: readonly TaskTemplateEdge[];
  agents: readonly AgentDefinition[];
  loop?: LoopDefinition | null;
}): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  const taskTemplateById = new Map(
    input.taskTemplates.map((taskTemplate) => [taskTemplate.taskTemplateId, taskTemplate]),
  );
  const enabledAgents = input.agents.filter((agent) => agent.enabled);
  const agentById = new Map(input.agents.map((agent) => [agent.agentId, agent]));

  if (!input.definition.enabled) {
    findings.push({
      code: "DEFINITION_DISABLED",
      severity: "error",
      message: "Definition is disabled.",
    });
  }

  if (input.taskTemplates.length === 0) {
    findings.push({
      code: "EMPTY_DEFINITION",
      severity: "error",
      message: "At least one task template is required.",
    });
  }

  if (input.taskTemplates.length > 0 && countDefinitionRoots(input.taskTemplates, input.edges) === 0) {
    findings.push({
      code: "NO_ROOT_TASK",
      severity: "error",
      message: "A root task is required.",
    });
  }

  if (containsCycle(input.taskTemplates, input.edges)) {
    findings.push({
      code: "GRAPH_CYCLE",
      severity: "error",
      message: "Task template graph contains a cycle.",
    });
  }

  for (const edge of input.edges) {
    if (edge.injectOutput && !edge.outputMergeKey) {
      findings.push({
        code: "INJECT_OUTPUT_MISSING_KEY",
        severity: "error",
        message: `${edge.fromTaskTemplateId} -> ${edge.toTaskTemplateId} injects output but has no outputMergeKey.`,
      });
    }

    if (!edge.injectOutput && edge.outputMergeKey) {
      findings.push({
        code: "MERGE_KEY_WITHOUT_INJECTION",
        severity: "error",
        message: `${edge.fromTaskTemplateId} -> ${edge.toTaskTemplateId} defines outputMergeKey without injectOutput.`,
      });
    }
  }

  const loopFindings = validateLoop(input.loop, taskTemplateById);
  findings.push(...loopFindings);

  for (const taskTemplate of input.taskTemplates) {
    const assignee = taskTemplate.defaultAssigneeAgentId;
    const requiredCapabilities = getRequiredCapabilities(taskTemplate);

    if (assignee) {
      const agent = agentById.get(assignee);

      if (!agent) {
        findings.push({
          code: "ASSIGNEE_NOT_FOUND",
          severity: "error",
          message: `${taskTemplate.title}: assignee ${assignee} does not exist.`,
        });
        continue;
      }

      if (!agent.enabled) {
        findings.push({
          code: "ASSIGNEE_DISABLED",
          severity: "error",
          message: `${taskTemplate.title}: assignee ${assignee} is disabled.`,
        });
      }

      if (!hasCapabilities(agent, requiredCapabilities)) {
        findings.push({
          code: "ASSIGNEE_CAPABILITY_MISMATCH",
          severity: "error",
          message: `${taskTemplate.title}: assignee ${assignee} does not satisfy requiredCapabilities.`,
        });
      }
      continue;
    }

    if (requiredCapabilities.length > 0) {
      const matched = enabledAgents.some((agent) => hasCapabilities(agent, requiredCapabilities));

      if (!matched) {
        findings.push({
          code: "NO_CAPABLE_AGENT",
          severity: "error",
          message: `${taskTemplate.title}: no enabled agent satisfies requiredCapabilities (${requiredCapabilities.join(", ")}).`,
        });
      }
    }
  }

  return findings;
}

export function getRequiredCapabilities(taskTemplate: TaskTemplate): string[] {
  const metadata = taskTemplate.metadata;

  if (!metadata || typeof metadata !== "object" || !("requiredCapabilities" in metadata)) {
    return [];
  }

  const requiredCapabilities = metadata.requiredCapabilities;

  return Array.isArray(requiredCapabilities)
    ? requiredCapabilities.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function hasCapabilities(
  agent: AgentDefinition,
  requiredCapabilities: readonly string[],
): boolean {
  return requiredCapabilities.every((capability) => agent.capabilities.includes(capability));
}

function containsCycle(
  taskTemplates: readonly TaskTemplate[],
  edges: readonly TaskTemplateEdge[],
): boolean {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  taskTemplates.forEach((taskTemplate) => {
    incoming.set(taskTemplate.taskTemplateId, 0);
    outgoing.set(taskTemplate.taskTemplateId, []);
  });

  edges.forEach((edge) => {
    outgoing.get(edge.fromTaskTemplateId)?.push(edge.toTaskTemplateId);
    incoming.set(edge.toTaskTemplateId, (incoming.get(edge.toTaskTemplateId) ?? 0) + 1);
  });

  const queue = [...incoming.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([taskTemplateId]) => taskTemplateId);
  let visited = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited += 1;

    for (const next of outgoing.get(current) ?? []) {
      const nextDegree = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, nextDegree);

      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  return visited !== taskTemplates.length;
}

function validateLoop(
  loop: LoopDefinition | null | undefined,
  taskTemplateById: ReadonlyMap<string, TaskTemplate>,
): PreflightFinding[] {
  if (!loop) {
    return [];
  }

  const findings: PreflightFinding[] = [];
  const allLoopTaskIds = new Set([
    loop.controllerTaskTemplateId,
    ...loop.entryTaskTemplateIds,
    ...loop.bodyTaskTemplateIds,
  ]);

  if (!taskTemplateById.has(loop.controllerTaskTemplateId)) {
    findings.push({
      code: "LOOP_CONTROLLER_MISSING",
      severity: "error",
      message: `Loop controller ${loop.controllerTaskTemplateId} does not exist.`,
    });
  }

  if (loop.entryTaskTemplateIds.length === 0) {
    findings.push({
      code: "LOOP_ENTRY_EMPTY",
      severity: "error",
      message: "Loop entry task list cannot be empty.",
    });
  }

  if (loop.bodyTaskTemplateIds.length === 0) {
    findings.push({
      code: "LOOP_BODY_EMPTY",
      severity: "error",
      message: "Loop body task list cannot be empty.",
    });
  }

  for (const taskTemplateId of allLoopTaskIds) {
    if (!taskTemplateById.has(taskTemplateId)) {
      findings.push({
        code: "LOOP_TASK_MISSING",
        severity: "error",
        message: `Loop references missing task template ${taskTemplateId}.`,
      });
    }
  }

  for (const entryTaskTemplateId of loop.entryTaskTemplateIds) {
    if (!loop.bodyTaskTemplateIds.includes(entryTaskTemplateId)) {
      findings.push({
        code: "LOOP_ENTRY_NOT_IN_BODY",
        severity: "error",
        message: `Loop entry ${entryTaskTemplateId} must also be part of the loop body.`,
      });
    }
  }

  if (loop.maxIterations < 1) {
    findings.push({
      code: "LOOP_MAX_ITERATIONS_INVALID",
      severity: "error",
      message: "Loop maxIterations must be at least 1.",
    });
  }

  return findings;
}

function withNameSuffix(name: string, suffix: string): string {
  return name.endsWith(` ${suffix}`) ? name : `${name} ${suffix}`;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }

  return value as Record<string, unknown>;
}

function expectWorkflowDefinition(value: unknown): WorkflowDefinition {
  const definition = expectRecord(value, "workflow definition");

  if (typeof definition.workflowDefinitionId !== "string" || typeof definition.name !== "string") {
    throw new Error("Invalid workflow definition import payload.");
  }

  return definition as WorkflowDefinition;
}

function expectTaskTemplates(value: unknown): TaskTemplate[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Imported taskTemplates must be an array.");
  }

  return value as TaskTemplate[];
}

function expectTaskTemplateEdges(value: unknown): TaskTemplateEdge[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Imported edges must be an array.");
  }

  return value as TaskTemplateEdge[];
}

function expectLoopDefinition(value: unknown): LoopDefinition | null {
  if (value === undefined || value === null) {
    return null;
  }

  return expectRecord(value, "loop definition") as LoopDefinition;
}

function expectSchedules(value: unknown): Schedule[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Imported schedules must be an array.");
  }

  return value as Schedule[];
}
