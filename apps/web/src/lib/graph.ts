import type { LoopDefinition, Run, Task, TaskEdge, TaskTemplate, TaskTemplateEdge } from "@regisseur/core";
import type { Edge, Node } from "reactflow";

const X_STEP = 280;
const Y_STEP = 180;
const GROUP_PADDING_X = 20;
const GROUP_PADDING_Y = 48;
const NODE_WIDTH = 240;
const NODE_HEIGHT = 184;

interface GraphBadge {
  label: string;
  tone: "accent" | "success" | "warning" | "danger" | "info" | "muted";
}

export interface FlowNodeData {
  title: string;
  subtitle?: string;
  badges: GraphBadge[];
  body?: string;
}

export interface FlowGraph {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

function topologicalColumns(
  nodeIds: readonly string[],
  edges: readonly { from: string; to: string }[],
): Map<string, number> {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  nodeIds.forEach((id) => {
    incoming.set(id, 0);
    outgoing.set(id, []);
  });
  edges.forEach((edge) => {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  });

  const queue = nodeIds.filter((id) => (incoming.get(id) ?? 0) === 0);
  const columns = new Map<string, number>(queue.map((id) => [id, 0]));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentColumn = columns.get(current) ?? 0;

    for (const child of outgoing.get(current) ?? []) {
      columns.set(child, Math.max(columns.get(child) ?? 0, currentColumn + 1));
      incoming.set(child, (incoming.get(child) ?? 1) - 1);

      if ((incoming.get(child) ?? 0) === 0) {
        queue.push(child);
      }
    }
  }

  nodeIds.forEach((id, index) => {
    if (!columns.has(id)) {
      columns.set(id, index % 3);
    }
  });

  return columns;
}

function inferPromptSummary(payload: Record<string, unknown>): string | undefined {
  const candidates = [payload.promptTemplate, payload.systemPrompt, payload.prompt];
  const firstString = candidates.find((value) => typeof value === "string");

  return typeof firstString === "string" ? firstString.slice(0, 120) : undefined;
}

export function buildDefinitionFlow(
  taskTemplates: readonly TaskTemplate[],
  edges: readonly TaskTemplateEdge[],
  loop?: LoopDefinition | null,
): FlowGraph {
  const columns = topologicalColumns(
    taskTemplates.map((template) => template.taskTemplateId),
    edges.map((edge) => ({
      from: edge.fromTaskTemplateId,
      to: edge.toTaskTemplateId,
    })),
  );
  const positions = buildGroupedTemplatePositions(taskTemplates, columns, loop);
  const incoming = new Set(edges.map((edge) => edge.toTaskTemplateId));
  const outgoing = new Set(edges.map((edge) => edge.fromTaskTemplateId));
  const nodes: Node<FlowNodeData>[] = [];

  if (loop?.bodyTaskTemplateIds.length) {
    const bodyGroup = createGroupNode({
      groupId: `loop:${loop.loopDefinitionId}`,
      label: `${loop.name} Body`,
      taskIds: loop.bodyTaskTemplateIds,
      positions,
      tone: "warning",
    });

    if (bodyGroup) {
      nodes.push(bodyGroup);
    }
  }

  taskTemplates.forEach((template) => {
    const isController = loop?.controllerTaskTemplateId === template.taskTemplateId;
    const isEntry = loop?.entryTaskTemplateIds.includes(template.taskTemplateId) ?? false;
    const isBody = loop?.bodyTaskTemplateIds.includes(template.taskTemplateId) ?? false;
    const groupId = isBody && loop ? `loop:${loop.loopDefinitionId}` : undefined;

    nodes.push({
      id: template.taskTemplateId,
      position: groupId
        ? {
            x: (positions.get(template.taskTemplateId)?.x ?? 0) - (positions.get(groupId)?.x ?? 0),
            y: (positions.get(template.taskTemplateId)?.y ?? 0) - (positions.get(groupId)?.y ?? 0),
          }
        : positions.get(template.taskTemplateId) ?? { x: 0, y: 0 },
      parentNode: groupId,
      extent: groupId ? "parent" : undefined,
      data: {
        title: template.title,
        subtitle: template.defaultAssigneeAgentId ?? "Unassigned",
        body: inferPromptSummary(template.payload),
        badges: [
          ...(!incoming.has(template.taskTemplateId)
            ? [{ label: "Root", tone: "accent" as const }]
            : []),
          ...(!outgoing.has(template.taskTemplateId)
            ? [{ label: "Leaf", tone: "muted" as const }]
            : []),
          ...(isController ? [{ label: "Controller", tone: "accent" as const }] : []),
          ...(isEntry ? [{ label: "Entry", tone: "info" as const }] : []),
          ...(isBody ? [{ label: "Loop", tone: "warning" as const }] : []),
          ...(Array.isArray(template.metadata?.requiredCapabilities) &&
          template.metadata.requiredCapabilities.length > 0
            ? [{ label: "Capability", tone: "success" as const }]
            : []),
        ],
      },
      draggable: false,
    });
  });

  return {
    nodes,
    edges: edges.map((edge) => ({
      id: `${edge.fromTaskTemplateId}:${edge.toTaskTemplateId}:${edge.type}`,
      source: edge.fromTaskTemplateId,
      target: edge.toTaskTemplateId,
      label: edge.injectOutput ? edge.outputMergeKey ?? "inject" : undefined,
      animated: Boolean(edge.injectOutput),
      style: edge.injectOutput ? { stroke: "var(--info)", strokeDasharray: "6 4" } : undefined,
    })),
  };
}

export function buildRuntimeFlow(
  tasks: readonly Task[],
  edges: readonly TaskEdge[],
  options?: {
    loop?: LoopDefinition | null;
    latestRunsByTaskId?: ReadonlyMap<string, Run | undefined>;
  },
): FlowGraph {
  const columns = topologicalColumns(
    tasks.map((task) => task.taskId),
    edges.map((edge) => ({ from: edge.fromTaskId, to: edge.toTaskId })),
  );
  const positions = buildGroupedRuntimePositions(tasks, columns);
  const incoming = new Set(edges.map((edge) => edge.toTaskId));
  const groupIds = new Set<string>();
  const nodes: Node<FlowNodeData>[] = [];

  tasks.forEach((task) => {
    const groupId = runtimeGroupId(task);

    if (groupIds.has(groupId)) {
      return;
    }

    groupIds.add(groupId);
    const label =
      task.iteration === undefined || task.iteration === null
        ? "Base Flow"
        : `Iteration ${task.iteration}`;
    const tone = task.iteration === undefined || task.iteration === null ? "info" : "warning";
    const groupTaskIds = tasks
      .filter((candidate) => runtimeGroupId(candidate) === groupId)
      .map((candidate) => candidate.taskId);

    const groupNode = createGroupNode({
      groupId,
      label,
      taskIds: groupTaskIds,
      positions,
      tone,
    });

    if (groupNode) {
      nodes.push(groupNode);
    }
  });

  tasks.forEach((task) => {
    const groupId = runtimeGroupId(task);
    const latestRun = options?.latestRunsByTaskId?.get(task.taskId);
    const isLoopController =
      Boolean(options?.loop?.controllerTaskTemplateId) &&
      options?.loop?.controllerTaskTemplateId === task.taskTemplateId;

    nodes.push({
      id: task.taskId,
      position: {
        x: (positions.get(task.taskId)?.x ?? 0) - (positions.get(groupId)?.x ?? 0),
        y: (positions.get(task.taskId)?.y ?? 0) - (positions.get(groupId)?.y ?? 0),
      },
      parentNode: groupId,
      extent: "parent",
      data: {
        title: task.title,
        subtitle: task.assigneeAgentId ?? "No assignee",
        body: inferPromptSummary(task.payload),
        badges: [
          ...(!incoming.has(task.taskId) ? [{ label: "Root", tone: "accent" as const }] : []),
          { label: task.status, tone: statusTone(task.status) },
          ...(latestRun ? [{ label: "Run", tone: "success" as const }] : [{ label: "No Run", tone: "muted" as const }]),
          ...(task.generationSource === "dynamic"
            ? [{ label: "Spawned", tone: "info" as const }]
            : []),
          ...(task.generationSource === "loop"
            ? [{ label: "Loop", tone: "warning" as const }]
            : []),
          ...(task.iteration !== undefined && task.iteration !== null
            ? [{ label: `iteration ${task.iteration}`, tone: "warning" as const }]
            : []),
          ...(isLoopController ? [{ label: "Controller", tone: "accent" as const }] : []),
        ],
      },
      draggable: false,
    });
  });

  return {
    nodes,
    edges: edges.map((edge) => ({
      id: `${edge.fromTaskId}:${edge.toTaskId}:${edge.type}`,
      source: edge.fromTaskId,
      target: edge.toTaskId,
      label: edge.injectOutput ? edge.outputMergeKey ?? "inject" : undefined,
      animated: Boolean(edge.injectOutput),
      style: edge.injectOutput ? { stroke: "var(--info)", strokeDasharray: "6 4" } : undefined,
    })),
  };
}

function buildGroupedTemplatePositions(
  taskTemplates: readonly TaskTemplate[],
  columns: ReadonlyMap<string, number>,
  loop?: LoopDefinition | null,
): Map<string, { x: number; y: number }> {
  const rowsByColumn = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  const bodySet = new Set(loop?.bodyTaskTemplateIds ?? []);
  let bodyIndex = 0;
  let outerIndex = 0;

  taskTemplates.forEach((template) => {
    const column = columns.get(template.taskTemplateId) ?? 0;

    if (bodySet.has(template.taskTemplateId)) {
      positions.set(template.taskTemplateId, {
        x: column * X_STEP,
        y: bodyIndex * Y_STEP,
      });
      bodyIndex += 1;
      return;
    }

    const row = rowsByColumn.get(column) ?? 0;
    rowsByColumn.set(column, row + 1);
    positions.set(template.taskTemplateId, {
      x: column * X_STEP,
      y: (loop?.bodyTaskTemplateIds.length ? bodyIndex * Y_STEP + Y_STEP : 0) + outerIndex * 24 + row * Y_STEP,
    });
    outerIndex += 1;
  });

  if (loop?.bodyTaskTemplateIds.length) {
    const bodyGroup = createGroupBounds(loop.bodyTaskTemplateIds, positions);

    if (bodyGroup) {
      positions.set(`loop:${loop.loopDefinitionId}`, bodyGroup);
    }
  }

  return positions;
}

function buildGroupedRuntimePositions(
  tasks: readonly Task[],
  columns: ReadonlyMap<string, number>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const groupedTasks = new Map<string, Task[]>();

  tasks.forEach((task) => {
    const groupId = runtimeGroupId(task);
    const current = groupedTasks.get(groupId) ?? [];
    current.push(task);
    groupedTasks.set(groupId, current);
  });

  const orderedGroupIds = [...groupedTasks.keys()].sort((left, right) => {
    if (left === "runtime-group:base") {
      return -1;
    }

    if (right === "runtime-group:base") {
      return 1;
    }

    return Number(left.replace("runtime-group:iteration-", "")) - Number(right.replace("runtime-group:iteration-", ""));
  });

  let nextGroupY = 0;

  orderedGroupIds.forEach((groupId) => {
    const groupTasks = groupedTasks.get(groupId) ?? [];
    const rowsByColumn = new Map<number, number>();

    groupTasks
      .sort((left, right) => {
        const leftColumn = columns.get(left.taskId) ?? 0;
        const rightColumn = columns.get(right.taskId) ?? 0;
        return leftColumn - rightColumn || left.title.localeCompare(right.title);
      })
      .forEach((task) => {
        const column = columns.get(task.taskId) ?? 0;
        const row = rowsByColumn.get(column) ?? 0;

        rowsByColumn.set(column, row + 1);
        positions.set(task.taskId, {
          x: column * X_STEP,
          y: nextGroupY + row * Y_STEP,
        });
      });

    const groupBounds = createGroupBounds(
      groupTasks.map((task) => task.taskId),
      positions,
    );

    if (groupBounds) {
      positions.set(groupId, groupBounds);
      nextGroupY = groupBounds.y + groupBounds.height + 44;
    }
  });

  return positions;
}

function createGroupBounds(
  taskIds: readonly string[],
  positions: ReadonlyMap<string, { x: number; y: number }>,
): { x: number; y: number; width: number; height: number } | null {
  const coordinates = taskIds
    .map((taskId) => positions.get(taskId))
    .filter((position): position is { x: number; y: number } => Boolean(position));

  if (coordinates.length === 0) {
    return null;
  }

  const minX = Math.min(...coordinates.map((position) => position.x)) - GROUP_PADDING_X;
  const minY = Math.min(...coordinates.map((position) => position.y)) - GROUP_PADDING_Y;
  const maxX = Math.max(...coordinates.map((position) => position.x)) + NODE_WIDTH + GROUP_PADDING_X;
  const maxY = Math.max(...coordinates.map((position) => position.y)) + NODE_HEIGHT + GROUP_PADDING_Y;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function createGroupNode(input: {
  groupId: string;
  label: string;
  taskIds: readonly string[];
  positions: ReadonlyMap<string, { x: number; y: number }>;
  tone: "warning" | "info";
}): Node<FlowNodeData> | null {
  const groupBounds = createGroupBounds(input.taskIds, input.positions);

  if (!groupBounds) {
    return null;
  }

  return {
    id: input.groupId,
    type: "lane",
    position: {
      x: groupBounds.x,
      y: groupBounds.y,
    },
    data: {
      title: input.label,
      badges: [],
    },
    selectable: false,
    draggable: false,
    style: {
      width: groupBounds.width,
      height: groupBounds.height,
      background:
        input.tone === "warning"
          ? "rgba(180, 83, 9, 0.07)"
          : "rgba(37, 99, 235, 0.06)",
      border:
        input.tone === "warning"
          ? "1px dashed rgba(180, 83, 9, 0.35)"
          : "1px dashed rgba(37, 99, 235, 0.35)",
      borderRadius: 18,
      padding: 12,
      zIndex: -1,
    },
  };
}

function runtimeGroupId(task: Task): string {
  return task.iteration === undefined || task.iteration === null
    ? "runtime-group:base"
    : `runtime-group:iteration-${task.iteration}`;
}

function statusTone(status: string): GraphBadge["tone"] {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    case "queued":
    case "running":
      return "info";
    case "waiting":
    case "blocked":
      return "warning";
    default:
      return "muted";
  }
}
