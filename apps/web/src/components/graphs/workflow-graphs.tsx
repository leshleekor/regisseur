import type { LoopDefinition, Run, Task, TaskEdge, TaskTemplate, TaskTemplateEdge } from "@regisseur/core";
import { Background, Controls, MiniMap, ReactFlow, type NodeProps } from "reactflow";
import type { JSX } from "react";
import "reactflow/dist/style.css";

import { buildDefinitionFlow, buildRuntimeFlow, type FlowNodeData } from "@/lib/graph";

import { Badge, Card, EmptyState } from "../ui/primitives";

function FlowNode({ data }: NodeProps<FlowNodeData>): JSX.Element {
  return (
    <Card className="w-60 p-4">
      <div className="space-y-3">
        <div>
          <div className="font-semibold">{data.title}</div>
          {data.subtitle ? <div className="text-xs text-[color:var(--muted)]">{data.subtitle}</div> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.badges.map((badge) => (
            <Badge key={`${badge.tone}-${badge.label}`} tone={badge.tone}>
              {badge.label}
            </Badge>
          ))}
        </div>
        {data.body ? <p className="line-clamp-4 text-xs text-[color:var(--muted)]">{data.body}</p> : null}
      </div>
    </Card>
  );
}

function FlowLaneNode({ data }: NodeProps<FlowNodeData>): JSX.Element {
  return (
    <div className="h-full rounded-[18px] border border-dashed border-[color:var(--border)] bg-white/30 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
        {data.title}
      </div>
    </div>
  );
}

const nodeTypes = {
  card: FlowNode,
  lane: FlowLaneNode,
};

export function DefinitionGraph({
  taskTemplates,
  edges,
  loop,
}: {
  taskTemplates: readonly TaskTemplate[];
  edges: readonly TaskTemplateEdge[];
  loop?: LoopDefinition | null;
}): JSX.Element {
  if (taskTemplates.length === 0) {
    return (
      <EmptyState
        title="No task templates"
        description="Create task templates first. Graph preview will appear as soon as nodes exist."
      />
    );
  }

  const graph = buildDefinitionFlow(taskTemplates, edges, loop);

  return (
    <div className="h-[560px] overflow-hidden rounded-md border border-[color:var(--border)] bg-white">
      <ReactFlow
        fitView
        nodes={graph.nodes.map((node) => ({
          ...node,
          type: node.type === "lane" ? "lane" : "card",
        }))}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap pannable zoomable />
        <Controls />
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}

export function RuntimeGraph({
  tasks,
  edges,
  loop,
  latestRunsByTaskId,
}: {
  tasks: readonly Task[];
  edges: readonly TaskEdge[];
  loop?: LoopDefinition | null;
  latestRunsByTaskId?: ReadonlyMap<string, Run | undefined>;
}): JSX.Element {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No runtime tasks"
        description="Start a workflow definition or pick a different workflow to inspect the runtime graph."
      />
    );
  }

  const graph = buildRuntimeFlow(tasks, edges, {
    loop,
    latestRunsByTaskId,
  });

  return (
    <div className="h-[560px] overflow-hidden rounded-md border border-[color:var(--border)] bg-white">
      <ReactFlow
        fitView
        nodes={graph.nodes.map((node) => ({
          ...node,
          type: node.type === "lane" ? "lane" : "card",
        }))}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap pannable zoomable />
        <Controls />
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
