import type {
  LoopDefinition,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
} from "@regisseur/core";
import type { Edge, Node } from "reactflow";

const X_STEP = 280;
const Y_STEP = 180;

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

function buildPositions(ids: readonly string[], edges: readonly { from: string; to: string }[]) {
  const columns = topologicalColumns(ids, edges);
  const rowsByColumn = new Map<number, number>();

  return new Map(
    ids.map((id) => {
      const column = columns.get(id) ?? 0;
      const row = rowsByColumn.get(column) ?? 0;

      rowsByColumn.set(column, row + 1);

      return [
        id,
        {
          x: column * X_STEP,
          y: row * Y_STEP,
        },
      ];
    }),
  );
}

function inferPromptSummary(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.promptTemplate,
    payload.systemPrompt,
    payload.prompt,
  ];
  const firstString = candidates.find((value) => typeof value === "string");

  return typeof firstString === "string" ? firstString.slice(0, 120) : undefined;
}

export function buildDefinitionFlow(
  taskTemplates: readonly TaskTemplate[],
  edges: readonly TaskTemplateEdge[],
  loop?: LoopDefinition | null,
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const positions = buildPositions(
    taskTemplates.map((template) => template.taskTemplateId),
    edges.map((edge) => ({
      from: edge.fromTaskTemplateId,
      to: edge.toTaskTemplateId,
    })),
  );

  return {
    nodes: taskTemplates.map((template) => {
      const isController = loop?.controllerTaskTemplateId === template.taskTemplateId;
      const isEntry = loop?.entryTaskTemplateIds.includes(template.taskTemplateId) ?? false;
      const isBody = loop?.bodyTaskTemplateIds.includes(template.taskTemplateId) ?? false;

      return {
        id: template.taskTemplateId,
        position: positions.get(template.taskTemplateId) ?? { x: 0, y: 0 },
        data: {
          title: template.title,
          subtitle: template.defaultAssigneeAgentId ?? "Unassigned",
          body: inferPromptSummary(template.payload),
          badges: [
            ...(isController ? [{ label: "Controller", tone: "accent" as const }] : []),
            ...(isEntry ? [{ label: "Entry", tone: "info" as const }] : []),
            ...(isBody ? [{ label: "Loop", tone: "warning" as const }] : []),
            ...(template.metadata?.requiredCapabilities
              ? [{ label: "Capability", tone: "success" as const }]
              : []),
          ],
        },
        draggable: false,
      };
    }),
    edges: edges.map((edge) => ({
      id: `${edge.fromTaskTemplateId}:${edge.toTaskTemplateId}:${edge.type}`,
      source: edge.fromTaskTemplateId,
      target: edge.toTaskTemplateId,
      label: edge.injectOutput ? edge.outputMergeKey ?? "inject" : undefined,
      animated: Boolean(edge.injectOutput),
    })),
  };
}

export function buildRuntimeFlow(
  tasks: readonly Task[],
  edges: readonly TaskEdge[],
  loop?: LoopDefinition | null,
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const positions = buildPositions(
    tasks.map((task) => task.taskId),
    edges.map((edge) => ({ from: edge.fromTaskId, to: edge.toTaskId })),
  );

  return {
    nodes: tasks.map((task) => {
      const isLoopController =
        Boolean(loop?.controllerTaskTemplateId) &&
        loop?.controllerTaskTemplateId === task.taskTemplateId;

      return {
        id: task.taskId,
        position: positions.get(task.taskId) ?? { x: 0, y: 0 },
        data: {
          title: task.title,
          subtitle: task.assigneeAgentId ?? "No assignee",
          body: inferPromptSummary(task.payload),
          badges: [
            { label: task.status, tone: statusTone(task.status) },
            ...(task.generationSource
              ? [{ label: task.generationSource, tone: "info" as const }]
              : []),
            ...(task.iteration !== undefined && task.iteration !== null
              ? [{ label: `iteration ${task.iteration}`, tone: "warning" as const }]
              : []),
            ...(isLoopController
              ? [{ label: "Controller", tone: "accent" as const }]
              : []),
          ],
        },
        draggable: false,
      };
    }),
    edges: edges.map((edge) => ({
      id: `${edge.fromTaskId}:${edge.toTaskId}:${edge.type}`,
      source: edge.fromTaskId,
      target: edge.toTaskId,
      label: edge.injectOutput ? edge.outputMergeKey ?? "inject" : undefined,
      animated: Boolean(edge.injectOutput),
    })),
  };
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
