import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  Schedule,
  Task,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
} from "@regisseur/core";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  Download,
  FileSearch,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";

import { JsonEditor } from "@/components/forms/json-editor";
import { KeyValueEditor } from "@/components/forms/key-value-editor";
import { PromptEditor } from "@/components/forms/prompt-editor";
import { DefinitionGraph, RuntimeGraph } from "@/components/graphs/workflow-graphs";
import { DataTable } from "@/components/ui/data-table";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Label,
  SectionHeader,
  Select,
  SkeletonBlock,
  StatCard,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { createId, createTimestamp } from "@/lib/ids";
import { asPrettyJson, copyText, formatDateTime, sortByUpdatedAtDescending } from "@/lib/utils";

function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}

function useDraftState<T>(
  value: T,
  syncKey: string | number | null | undefined,
): [T, (nextValue: T) => void] {
  const [draft, setDraft] = useState<T>(value);
  const draftRef = useRef(draft);
  const lastSyncKeyRef = useRef(syncKey);
  const initializedRef = useRef(value !== undefined);

  draftRef.current = draft;

  useEffect(() => {
    const keyChanged = lastSyncKeyRef.current !== syncKey;

    if (keyChanged) {
      lastSyncKeyRef.current = syncKey;
      initializedRef.current = value !== undefined || draftRef.current !== undefined;
      if (value !== undefined || draftRef.current === undefined) {
        setDraft(value);
      }
      return;
    }

    if (!initializedRef.current && value !== undefined) {
      initializedRef.current = true;
      setDraft(value);
    }
  }, [syncKey, value]);

  return [draft, setDraft];
}

function isDirtyDraft<T extends object>(draft: T | undefined, baseline: T | undefined): boolean {
  if (!draft || !baseline) {
    return false;
  }

  return JSON.stringify(draft) !== JSON.stringify(baseline);
}

function statusTone(
  status: string,
): "accent" | "success" | "warning" | "danger" | "info" | "muted" {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    case "running":
    case "queued":
      return "info";
    case "waiting":
    case "blocked":
    case "timeout":
      return "warning";
    case "ready":
      return "accent";
    default:
      return "muted";
  }
}

function copyJson(value: unknown): void {
  void copyText(asPrettyJson(value)).catch((error) => {
    window.alert(normalizeError(error));
  });
}

function exportJson(filename: string, value: unknown): void {
  const blob = new Blob([asPrettyJson(value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function countDefinitionRoots(
  taskTemplates: readonly TaskTemplate[],
  edges: readonly TaskTemplateEdge[],
): number {
  const blocked = new Set(edges.map((edge) => edge.toTaskTemplateId));

  return taskTemplates.filter((taskTemplate) => !blocked.has(taskTemplate.taskTemplateId)).length;
}

function workflowDefinitionStartPreflight({
  definition,
  taskTemplates,
  edges,
  agents,
}: {
  definition: WorkflowDefinition;
  taskTemplates: readonly TaskTemplate[];
  edges: readonly TaskTemplateEdge[];
  agents: readonly AgentDefinition[];
}): string[] {
  const findings: string[] = [];

  if (!definition.enabled) {
    findings.push("Definition is disabled.");
  }

  if (taskTemplates.length === 0) {
    findings.push("At least one task template is required.");
  }

  if (taskTemplates.length > 0 && countDefinitionRoots(taskTemplates, edges) === 0) {
    findings.push("A root task is required.");
  }

  const agentMap = new Map(agents.map((agent) => [agent.agentId, agent]));
  for (const taskTemplate of taskTemplates) {
    const assignee = taskTemplate.defaultAssigneeAgentId;

    if (!assignee) {
      continue;
    }

    const agent = agentMap.get(assignee);
    if (!agent) {
      findings.push(`${taskTemplate.title}: assignee ${assignee} does not exist.`);
      continue;
    }

    if (!agent.enabled) {
      findings.push(`${taskTemplate.title}: assignee ${assignee} is disabled.`);
    }
  }

  return findings;
}

function fieldSection(
  label: string,
  value: ReactNode,
): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function LoadingPanel(): JSX.Element {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-12" />
      <SkeletonBlock className="h-48" />
      <SkeletonBlock className="h-64" />
    </div>
  );
}

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const definitionsQuery = useQuery({
    queryKey: ["workflow-definitions"],
    queryFn: () => api.listWorkflowDefinitions(),
    refetchInterval: 20_000,
  });
  const enabledSchedulesQuery = useQuery({
    queryKey: ["schedules", "enabled"],
    queryFn: () => api.listSchedules({ enabled: true }),
    refetchInterval: 20_000,
  });
  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
    refetchInterval: 15_000,
  });
  const failedTasksQuery = useQuery({
    queryKey: ["tasks", "failed"],
    queryFn: () => api.listTasks({ status: "failed" }),
    refetchInterval: 15_000,
  });
  const failedRunsQuery = useQuery({
    queryKey: ["runs", "failed"],
    queryFn: () => api.listRuns({ status: "failed" }),
    refetchInterval: 15_000,
  });
  const timeoutRunsQuery = useQuery({
    queryKey: ["runs", "timeout"],
    queryFn: () => api.listRuns({ status: "timeout" }),
    refetchInterval: 15_000,
  });

  if (
    definitionsQuery.isLoading ||
    enabledSchedulesQuery.isLoading ||
    workflowsQuery.isLoading ||
    failedTasksQuery.isLoading ||
    failedRunsQuery.isLoading ||
    timeoutRunsQuery.isLoading
  ) {
    return <LoadingPanel />;
  }

  if (
    definitionsQuery.error ||
    enabledSchedulesQuery.error ||
    workflowsQuery.error ||
    failedTasksQuery.error ||
    failedRunsQuery.error ||
    timeoutRunsQuery.error
  ) {
    return (
      <ErrorState
        message={normalizeError(
          definitionsQuery.error ??
            enabledSchedulesQuery.error ??
            workflowsQuery.error ??
            failedTasksQuery.error ??
            failedRunsQuery.error ??
            timeoutRunsQuery.error,
        )}
      />
    );
  }

  const workflows = workflowsQuery.data ?? [];
  const runningWorkflows = workflows.filter((workflow) => workflow.status === "running");
  const failedWorkflows = workflows.filter((workflow) => workflow.status === "failed");
  const recentWorkflows = sortByUpdatedAtDescending(workflows).slice(0, 6);
  const recentFailures = sortByUpdatedAtDescending(failedTasksQuery.data ?? []).slice(0, 5);
  const recentRuns = sortByUpdatedAtDescending([
    ...(failedRunsQuery.data ?? []),
    ...(timeoutRunsQuery.data ?? []),
  ]).slice(0, 6);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="System Pulse"
        description="Operator-first view of definitions, schedules, live execution, and the latest failure pressure."
        actions={
          <>
            <Button onClick={() => void navigate({ to: "/workflow-definitions/new" })}>
              <Plus className="h-4 w-4" />
              New Definition
            </Button>
            <Button variant="secondary" onClick={() => void navigate({ to: "/agents/new" })}>
              <Plus className="h-4 w-4" />
              New Agent
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Definitions" value={`${definitionsQuery.data?.length ?? 0}`} />
        <StatCard label="Enabled Schedules" value={`${enabledSchedulesQuery.data?.length ?? 0}`} tone="warning" />
        <StatCard label="Running Workflows" value={`${runningWorkflows.length}`} tone="info" />
        <StatCard label="Failed Workflows" value={`${failedWorkflows.length}`} tone="danger" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-6">
          <SectionHeader
            title="Recent Workflows"
            description="Latest materialized workflows with their current execution state."
          />
          <div className="mt-4 space-y-3">
            {recentWorkflows.length === 0 ? (
              <EmptyState
                title="No runtime workflows"
                description="Start a workflow definition and the runtime stream will show up here."
              />
            ) : (
              recentWorkflows.map((workflow) => (
                <Link
                  key={workflow.workflowId}
                  to="/workflows/$workflowId"
                  params={{ workflowId: workflow.workflowId }}
                  className="flex items-center justify-between rounded-md border border-[color:var(--border)] bg-white px-4 py-3 transition hover:bg-slate-50"
                >
                  <div>
                    <div className="font-semibold">{workflow.name}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {workflow.workflowDefinitionId ?? "ad hoc runtime"} · {formatDateTime(workflow.updatedAt)}
                    </div>
                  </div>
                  <Badge tone={statusTone(workflow.status)}>{workflow.status}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <SectionHeader
            title="Fast Actions"
            description="Start from the authoring surface or jump into operations."
          />
          <div className="mt-4 grid gap-3">
            <LinkCard
              to="/workflow-definitions"
              title="Inspect authoring layer"
              description="Open definitions, graph, tasks, loop, and schedules."
            />
            <LinkCard
              to="/workflows"
              title="Open runtime monitor"
              description="Track live workflows, failed tasks, and runtime graphs."
            />
            <LinkCard
              to="/schedules"
              title="Review automation"
              description="Manage once/cron schedules and triggered workflow history."
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <SectionHeader
            title="Failed Tasks"
            description="The latest task-level breakpoints across running workflows."
          />
          <div className="mt-4 space-y-3">
            {recentFailures.length === 0 ? (
              <EmptyState
                title="No failed tasks"
                description="Task failures will appear here as soon as a workflow stalls."
              />
            ) : (
              recentFailures.map((task) => (
                <Link
                  key={task.taskId}
                  to="/tasks/$taskId"
                  params={{ taskId: task.taskId }}
                  className="flex items-center justify-between rounded-md border border-[color:var(--border)] bg-white px-4 py-3"
                >
                  <div>
                    <div className="font-semibold">{task.title}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      workflow {task.workflowId} · {task.assigneeAgentId ?? "no assignee"}
                    </div>
                  </div>
                  <Badge tone="danger">{task.status}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <SectionHeader
            title="Problem Runs"
            description="Failed and timeout run attempts from the latest execution window."
          />
          <div className="mt-4 space-y-3">
            {recentRuns.length === 0 ? (
              <EmptyState
                title="No failed runs"
                description="Run-level failures and timeouts will surface here."
              />
            ) : (
              recentRuns.map((run) => (
                <Link
                  key={run.runId}
                  to="/runs/$runId"
                  params={{ runId: run.runId }}
                  className="flex items-center justify-between rounded-md border border-[color:var(--border)] bg-white px-4 py-3"
                >
                  <div>
                    <div className="font-semibold">{run.runId}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      task {run.taskId} · agent {run.agentId}
                    </div>
                  </div>
                  <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function LinkCard({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}): JSX.Element {
  return (
    <Link
      to={to}
      className="block rounded-md border border-[color:var(--border)] bg-white p-4 transition hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">{description}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-[color:var(--muted)]" />
      </div>
    </Link>
  );
}

export function WorkflowDefinitionsPage(): JSX.Element {
  const [search, setSearch] = useState("");
  const definitionsQuery = useQuery({
    queryKey: ["workflow-definitions"],
    queryFn: () => api.listWorkflowDefinitions(),
  });
  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
  });
  const runtimeByDefinition = useMemo(() => {
    const counts = new Map<string, number>();

    (workflowsQuery.data ?? []).forEach((workflow) => {
      if (!workflow.workflowDefinitionId) {
        return;
      }

      counts.set(
        workflow.workflowDefinitionId,
        (counts.get(workflow.workflowDefinitionId) ?? 0) + 1,
      );
    });

    return counts;
  }, [workflowsQuery.data]);
  const rows = useMemo(() => {
    return sortByUpdatedAtDescending(definitionsQuery.data ?? []).filter((definition) => {
      const haystack = `${definition.name} ${definition.description ?? ""}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [definitionsQuery.data, search]);
  const columns = useMemo<ColumnDef<WorkflowDefinition>[]>(
    () => [
      {
        header: "Definition",
        cell: ({ row }) => (
          <div>
            <Link
              to="/workflow-definitions/$workflowDefinitionId/overview"
              params={{ workflowDefinitionId: row.original.workflowDefinitionId }}
              className="font-semibold text-[color:var(--accent-strong)]"
            >
              {row.original.name}
            </Link>
            <div className="mt-1 text-xs text-[color:var(--muted)]">
              {row.original.workflowDefinitionId}
            </div>
          </div>
        ),
      },
      {
        header: "Description",
        cell: ({ row }) => (
          <div className="max-w-md text-sm text-[color:var(--muted)]">
            {row.original.description ?? "—"}
          </div>
        ),
      },
      {
        header: "Enabled",
        cell: ({ row }) => (
          <Badge tone={row.original.enabled ? "success" : "warning"}>
            {row.original.enabled ? "enabled" : "disabled"}
          </Badge>
        ),
      },
      {
        header: "Runtime",
        cell: ({ row }) =>
          `${runtimeByDefinition.get(row.original.workflowDefinitionId) ?? 0} runs`,
      },
      {
        header: "Updated",
        cell: ({ row }) => formatDateTime(row.original.updatedAt),
      },
    ],
    [runtimeByDefinition],
  );

  if (definitionsQuery.isLoading || workflowsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (definitionsQuery.error || workflowsQuery.error) {
    return (
      <ErrorState
        message={normalizeError(definitionsQuery.error ?? workflowsQuery.error)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Workflow Definitions"
        description="Static authoring layer for task templates, graph edges, loops, and attached schedules."
        actions={
          <Link to="/workflow-definitions/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Definition
            </Button>
          </Link>
        }
      />
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full max-w-md">
            <Label>Search Definitions</Label>
            <Input
              value={search}
              placeholder="Search by name or description"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              void definitionsQuery.refetch();
              void workflowsQuery.refetch();
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </Card>
      {rows.length === 0 ? (
        <EmptyState
          title="No definitions found"
          description="Create a workflow definition or adjust the current filter."
        />
      ) : (
        <DataTable columns={columns} data={rows} />
      )}
    </div>
  );
}

export function NewWorkflowDefinitionPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WorkflowDefinition>(() => {
    const timestamp = createTimestamp();

    return {
      workflowDefinitionId: createId("workflow-definition"),
      name: "Untitled Definition",
      description: "",
      enabled: true,
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  const saveMutation = useMutation({
    mutationFn: (payload: WorkflowDefinition) => api.upsertWorkflowDefinition(payload),
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      await navigate({
        to: "/workflow-definitions/$workflowDefinitionId/overview",
        params: { workflowDefinitionId: payload.workflowDefinitionId },
      });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const dirty = draft.name.length > 0;
  useUnsavedChangesGuard(dirty);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Create Workflow Definition"
        description="Seed the authoring object first. Tasks, graph, loop, and schedules can be attached after the initial save."
        actions={
          <Button
            onClick={() =>
              saveMutation.mutate({
                ...draft,
                updatedAt: createTimestamp(),
              })
            }
            disabled={saveMutation.isPending}
          >
            <Save className="h-4 w-4" />
            Save
          </Button>
        }
      />
      <WorkflowDefinitionOverviewDraftForm draft={draft} setDraft={setDraft} />
    </div>
  );
}

export function DefinitionDetailShell({
  workflowDefinitionId,
}: {
  workflowDefinitionId: string;
}): JSX.Element {
  const definitionQuery = useQuery({
    queryKey: ["workflow-definition", workflowDefinitionId],
    queryFn: () => api.getWorkflowDefinition(workflowDefinitionId),
  });

  if (definitionQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (definitionQuery.error || !definitionQuery.data) {
    return <ErrorState message={normalizeError(definitionQuery.error ?? new Error("Definition not found"))} />;
  }

  const tabItems = [
    { to: "/workflow-definitions/$workflowDefinitionId/overview", label: "Overview" },
    { to: "/workflow-definitions/$workflowDefinitionId/tasks", label: "Tasks" },
    { to: "/workflow-definitions/$workflowDefinitionId/graph", label: "Graph" },
    { to: "/workflow-definitions/$workflowDefinitionId/loop", label: "Loop" },
    { to: "/workflow-definitions/$workflowDefinitionId/schedules", label: "Schedules" },
    { to: "/workflow-definitions/$workflowDefinitionId/runs", label: "Run History" },
  ] as const;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={definitionQuery.data.name}
        description={definitionQuery.data.description ?? "Workflow definition authoring surface."}
        actions={
          <>
            <Badge tone={definitionQuery.data.enabled ? "success" : "warning"}>
              {definitionQuery.data.enabled ? "enabled" : "disabled"}
            </Badge>
            <Button variant="ghost" onClick={() => copyJson(definitionQuery.data)}>
              <Copy className="h-4 w-4" />
              Copy JSON
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        {tabItems.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ workflowDefinitionId }}
            className="rounded-md border border-[color:var(--border)] bg-white px-4 py-2 text-sm font-semibold transition hover:bg-slate-50"
            activeProps={{
              className:
                "rounded-md border border-transparent bg-[color:var(--accent)] text-white px-4 py-2 text-sm font-semibold",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}

function WorkflowDefinitionOverviewDraftForm({
  draft,
  setDraft,
}: {
  draft: WorkflowDefinition;
  setDraft: (nextValue: WorkflowDefinition) => void;
}): JSX.Element {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <Card className="space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Definition ID</Label>
            <Input value={draft.workflowDefinitionId} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Enabled</Label>
            <Select
              value={draft.enabled ? "true" : "false"}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  enabled: event.target.value === "true",
                })
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={draft.name}
            onChange={(event) =>
              setDraft({
                ...draft,
                name: event.target.value,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={draft.description ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                description: event.target.value,
              })
            }
          />
        </div>
        <JsonEditor
          label="Metadata"
          value={draft.metadata ?? {}}
          onChange={(metadata) =>
            setDraft({
              ...draft,
              metadata,
            })
          }
          minHeightClassName="min-h-40"
        />
      </Card>
      <Card className="space-y-4 p-6">
        <div>{fieldSection("Created", formatDateTime(draft.createdAt))}</div>
        <div>{fieldSection("Updated", formatDateTime(draft.updatedAt))}</div>
        <div>{fieldSection("Description", draft.description || "—")}</div>
        <div>{fieldSection("Metadata", <pre className="whitespace-pre-wrap text-xs">{asPrettyJson(draft.metadata ?? {})}</pre>)}</div>
      </Card>
    </div>
  );
}

export function DefinitionOverviewPage({
  workflowDefinitionId,
}: {
  workflowDefinitionId: string;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const definitionQuery = useQuery({
    queryKey: ["workflow-definition", workflowDefinitionId],
    queryFn: () => api.getWorkflowDefinition(workflowDefinitionId),
  });
  const taskTemplatesQuery = useQuery({
    queryKey: ["task-templates", workflowDefinitionId],
    queryFn: () => api.listTaskTemplates(workflowDefinitionId),
  });
  const taskTemplateEdgesQuery = useQuery({
    queryKey: ["task-template-edges", workflowDefinitionId],
    queryFn: () => api.listTaskTemplateEdges(workflowDefinitionId),
  });
  const loopsQuery = useQuery({
    queryKey: ["loops", workflowDefinitionId],
    queryFn: () => api.listLoops(workflowDefinitionId),
  });
  const schedulesQuery = useQuery({
    queryKey: ["schedules", "definition", workflowDefinitionId],
    queryFn: () => api.listSchedules({ targetType: "workflow", targetId: workflowDefinitionId }),
  });
  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
  });
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
  });

  const [draft, setDraft] = useDraftState(definitionQuery.data, workflowDefinitionId);
  const saveMutation = useMutation({
    mutationFn: (payload: WorkflowDefinition) => api.upsertWorkflowDefinition(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-definition", workflowDefinitionId] });
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteWorkflowDefinition(workflowDefinitionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      await navigate({ to: "/workflow-definitions" });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const startMutation = useMutation({
    mutationFn: () => api.startWorkflowDefinition(workflowDefinitionId, createTimestamp()),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      await navigate({ to: "/workflows/$workflowId", params: { workflowId: result.workflowId } });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });

  const dirty = isDirtyDraft(draft, definitionQuery.data);
  useUnsavedChangesGuard(dirty);

  if (
    definitionQuery.isLoading ||
    taskTemplatesQuery.isLoading ||
    taskTemplateEdgesQuery.isLoading ||
    loopsQuery.isLoading ||
    schedulesQuery.isLoading ||
    workflowsQuery.isLoading ||
    agentsQuery.isLoading ||
    !draft
  ) {
    return <LoadingPanel />;
  }

  if (
    definitionQuery.error ||
    taskTemplatesQuery.error ||
    taskTemplateEdgesQuery.error ||
    loopsQuery.error ||
    schedulesQuery.error ||
    workflowsQuery.error ||
    agentsQuery.error
  ) {
    return (
      <ErrorState
        message={normalizeError(
          definitionQuery.error ??
            taskTemplatesQuery.error ??
            taskTemplateEdgesQuery.error ??
            loopsQuery.error ??
            schedulesQuery.error ??
            workflowsQuery.error ??
            agentsQuery.error,
        )}
      />
    );
  }

  const preflightFindings = workflowDefinitionStartPreflight({
    definition: draft,
    taskTemplates: taskTemplatesQuery.data ?? [],
    edges: taskTemplateEdgesQuery.data ?? [],
    agents: agentsQuery.data ?? [],
  });
  const relatedWorkflows = (workflowsQuery.data ?? []).filter(
    (workflow) => workflow.workflowDefinitionId === workflowDefinitionId,
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        description="Top-level metadata, start preflight, and destructive controls for this definition."
        actions={
          <>
            <Button variant="secondary" onClick={() => exportJson(`${workflowDefinitionId}.json`, draft)}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="secondary" onClick={() => copyJson(draft)}>
              <Copy className="h-4 w-4" />
              Copy JSON
            </Button>
            <Button
              onClick={async () => {
                if (!draft) {
                  return;
                }

                if (definitionQuery.data?.updatedAt) {
                  const latest = await api.getWorkflowDefinition(workflowDefinitionId);
                  if (latest.updatedAt !== definitionQuery.data.updatedAt) {
                    const proceed = window.confirm(
                      "The definition changed on the server. Overwrite with your local draft?",
                    );

                    if (!proceed) {
                      return;
                    }
                  }
                }

                saveMutation.mutate({
                  ...draft,
                  updatedAt: createTimestamp(),
                });
              }}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button
              variant="danger"
              disabled={startMutation.isPending || preflightFindings.length > 0}
              onClick={() => startMutation.mutate()}
            >
              <Play className="h-4 w-4" />
              Start
            </Button>
          </>
        }
      />

      <WorkflowDefinitionOverviewDraftForm draft={draft} setDraft={setDraft} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4 p-6">
          <SectionHeader
            title="Start Preflight"
            description="Minimum operator guardrails before materializing a runtime workflow."
          />
          {preflightFindings.length === 0 ? (
            <div className="rounded-md border border-[color:var(--success)]/25 bg-[color:var(--success)]/8 p-4 text-sm text-[color:var(--success)]">
              Definition is ready for start.
            </div>
          ) : (
            <div className="space-y-2">
              {preflightFindings.map((finding) => (
                <div
                  key={finding}
                  className="flex items-start gap-3 rounded-md border border-[color:var(--warning)]/25 bg-[color:var(--warning)]/10 p-4 text-sm text-[color:var(--foreground)]"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-[color:var(--warning)]" />
                  <span>{finding}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-6">
          <SectionHeader
            title="Delete Impact"
            description="Best-effort summary before deleting this definition."
            actions={
              <Button
                variant="danger"
                onClick={() => {
                  const summary = [
                    `${taskTemplatesQuery.data?.length ?? 0} task templates`,
                    `${taskTemplateEdgesQuery.data?.length ?? 0} graph edges`,
                    `${loopsQuery.data?.length ?? 0} loop definitions`,
                    `${schedulesQuery.data?.length ?? 0} attached schedules`,
                    `${relatedWorkflows.length} runtime workflows`,
                  ].join(", ");

                  const approved = window.confirm(
                    `Delete ${draft.name}?\n\nImpact summary: ${summary}`,
                  );

                  if (approved) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete Definition
              </Button>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-4">{fieldSection("Task Templates", `${taskTemplatesQuery.data?.length ?? 0}`)}</Card>
            <Card className="p-4">{fieldSection("Loop Present", loopsQuery.data?.length ? "Yes" : "No")}</Card>
            <Card className="p-4">{fieldSection("Attached Schedules", `${schedulesQuery.data?.length ?? 0}`)}</Card>
            <Card className="p-4">{fieldSection("Runtime Workflows", `${relatedWorkflows.length}`)}</Card>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function DefinitionTasksPage({
  workflowDefinitionId,
}: {
  workflowDefinitionId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const taskTemplatesQuery = useQuery({
    queryKey: ["task-templates", workflowDefinitionId],
    queryFn: () => api.listTaskTemplates(workflowDefinitionId),
  });
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
  });
  const [selectedTaskTemplateId, setSelectedTaskTemplateId] = useState<string | null>(null);
  const selectedTaskTemplate = useMemo(
    () =>
      taskTemplatesQuery.data?.find(
        (taskTemplate) => taskTemplate.taskTemplateId === selectedTaskTemplateId,
      ) ?? null,
    [selectedTaskTemplateId, taskTemplatesQuery.data],
  );
  const [draft, setDraft] = useDraftState(
    selectedTaskTemplate ?? undefined,
    selectedTaskTemplate?.taskTemplateId ?? "__new-task-template__",
  );
  const taskDraftDirty = useMemo(
    () => JSON.stringify(draft ?? null) !== JSON.stringify(selectedTaskTemplate ?? null),
    [draft, selectedTaskTemplate],
  );

  function confirmTaskTemplateDiscard(): boolean {
    if (!taskDraftDirty) {
      return true;
    }

    return window.confirm("You have unsaved task template changes. Discard them and continue?");
  }

  useEffect(() => {
    if (!taskTemplatesQuery.data || taskTemplatesQuery.data.length === 0) {
      return;
    }

    if (!selectedTaskTemplateId) {
      setSelectedTaskTemplateId(taskTemplatesQuery.data[0].taskTemplateId);
    }
  }, [selectedTaskTemplateId, taskTemplatesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: TaskTemplate) => api.upsertTaskTemplate(workflowDefinitionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-templates", workflowDefinitionId] });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (taskTemplateId: string) => api.deleteTaskTemplate(taskTemplateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-templates", workflowDefinitionId] });
      setSelectedTaskTemplateId(null);
      setDraft(undefined);
    },
    onError: (error) => window.alert(normalizeError(error)),
  });

  if (taskTemplatesQuery.isLoading || agentsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (taskTemplatesQuery.error || agentsQuery.error) {
    return (
      <ErrorState
        message={normalizeError(taskTemplatesQuery.error ?? agentsQuery.error)}
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="space-y-4 p-5">
        <SectionHeader
          title="Task Templates"
          description="Prompt/payload authoring lives here."
          actions={
            <Button
              onClick={() => {
                if (!confirmTaskTemplateDiscard()) {
                  return;
                }

                const timestamp = createTimestamp();
                const nextTaskTemplate: TaskTemplate = {
                  taskTemplateId: createId("task-template"),
                  workflowDefinitionId,
                  title: "Untitled Task",
                  payload: {
                    promptTemplate: "",
                    systemPrompt: "",
                    model: "gpt-5",
                    variables: {},
                    dynamicPromptPolicy: {
                      mode: "fixed",
                    },
                  },
                  retryCount: 0,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  metadata: {
                    requiredCapabilities: [],
                  },
                };

                setSelectedTaskTemplateId(nextTaskTemplate.taskTemplateId);
                setDraft(nextTaskTemplate);
              }}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          }
        />
        <div className="space-y-2">
          {(taskTemplatesQuery.data ?? []).map((taskTemplate) => (
            <button
              key={taskTemplate.taskTemplateId}
              type="button"
              onClick={() => {
                if (taskTemplate.taskTemplateId === selectedTaskTemplateId) {
                  return;
                }

                if (!confirmTaskTemplateDiscard()) {
                  return;
                }

                setSelectedTaskTemplateId(taskTemplate.taskTemplateId);
              }}
              className="w-full rounded-md border border-[color:var(--border)] bg-white px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="font-semibold">{taskTemplate.title}</div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                {taskTemplate.defaultAssigneeAgentId ?? "No assignee"}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {!draft ? (
        <EmptyState
          title="Select a task template"
          description="Choose an existing template or create a new one to edit prompts, payload, and metadata."
        />
      ) : (
        <Card className="space-y-6 p-6">
          <SectionHeader
            title={draft.title}
            description="Structured prompt authoring plus raw payload and metadata access."
            actions={
              <>
                <Button variant="secondary" onClick={() => exportJson(`${draft.taskTemplateId}.json`, draft)}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button
                  onClick={() =>
                    saveMutation.mutate({
                      ...draft,
                      updatedAt: createTimestamp(),
                    })
                  }
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (
                      window.confirm(`Delete task template ${draft.title}?`)
                    ) {
                      deleteMutation.mutate(draft.taskTemplateId);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            }
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Task Template ID</Label>
              <Input value={draft.taskTemplateId} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Default Assignee Agent ID</Label>
              <Select
                value={draft.defaultAssigneeAgentId ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    defaultAssigneeAgentId: event.target.value || undefined,
                  })
                }
              >
                <option value="">Unassigned</option>
                {(agentsQuery.data ?? []).map((agent) => (
                  <option key={agent.agentId} value={agent.agentId}>
                    {agent.agentId} {agent.enabled ? "" : "(disabled)"}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    title: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Retry Count</Label>
              <Input
                type="number"
                value={draft.retryCount}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    retryCount: Number(event.target.value),
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Concurrency Key</Label>
            <Input
              value={draft.concurrencyKey ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  concurrencyKey: event.target.value || undefined,
                })
              }
            />
          </div>

          <PromptEditor
            value={draft.payload}
            onChange={(payload) =>
              setDraft({
                ...draft,
                payload,
              })
            }
          />

          <JsonEditor
            label="Metadata"
            value={draft.metadata ?? {}}
            onChange={(metadata) =>
              setDraft({
                ...draft,
                metadata,
              })
            }
          />
          <JsonEditor
            label="Raw Payload"
            value={draft.payload}
            onChange={(payload) =>
              setDraft({
                ...draft,
                payload,
              })
            }
          />
        </Card>
      )}
    </div>
  );
}

export function DefinitionGraphPage({
  workflowDefinitionId,
}: {
  workflowDefinitionId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["task-templates", workflowDefinitionId],
    queryFn: () => api.listTaskTemplates(workflowDefinitionId),
  });
  const edgesQuery = useQuery({
    queryKey: ["task-template-edges", workflowDefinitionId],
    queryFn: () => api.listTaskTemplateEdges(workflowDefinitionId),
  });
  const loopsQuery = useQuery({
    queryKey: ["loops", workflowDefinitionId],
    queryFn: () => api.listLoops(workflowDefinitionId),
  });
  const [newEdge, setNewEdge] = useState<Partial<TaskTemplateEdge>>({
    type: "depends_on",
    injectOutput: false,
  });
  const createMutation = useMutation({
    mutationFn: (payload: TaskTemplateEdge) => api.createTaskTemplateEdge(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-template-edges", workflowDefinitionId] });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: ({ fromTaskTemplateId, toTaskTemplateId }: TaskTemplateEdge) =>
      api.deleteTaskTemplateEdge(fromTaskTemplateId, toTaskTemplateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-template-edges", workflowDefinitionId] });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });

  if (templatesQuery.isLoading || edgesQuery.isLoading || loopsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (templatesQuery.error || edgesQuery.error || loopsQuery.error) {
    return (
      <ErrorState
        message={normalizeError(templatesQuery.error ?? edgesQuery.error ?? loopsQuery.error)}
      />
    );
  }

  const taskTemplates = templatesQuery.data ?? [];
  const loop = loopsQuery.data?.[0] ?? null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Definition Graph"
        description="Static DAG preview with edge injection controls and loop annotations."
      />
      <DefinitionGraph
        taskTemplates={taskTemplates}
        edges={edgesQuery.data ?? []}
        loop={loop}
      />

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="space-y-4 p-6">
          <SectionHeader
            title="Create Edge"
            description="Form-based edge authoring. Drag-and-drop remains Phase 2."
          />
          <div className="space-y-2">
            <Label>From Task Template</Label>
            <Select
              value={newEdge.fromTaskTemplateId ?? ""}
              onChange={(event) =>
                setNewEdge({
                  ...newEdge,
                  fromTaskTemplateId: event.target.value,
                })
              }
            >
              <option value="">Select</option>
              {taskTemplates.map((taskTemplate) => (
                <option key={taskTemplate.taskTemplateId} value={taskTemplate.taskTemplateId}>
                  {taskTemplate.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To Task Template</Label>
            <Select
              value={newEdge.toTaskTemplateId ?? ""}
              onChange={(event) =>
                setNewEdge({
                  ...newEdge,
                  toTaskTemplateId: event.target.value,
                })
              }
            >
              <option value="">Select</option>
              {taskTemplates.map((taskTemplate) => (
                <option key={taskTemplate.taskTemplateId} value={taskTemplate.taskTemplateId}>
                  {taskTemplate.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Inject Output</Label>
            <Select
              value={newEdge.injectOutput ? "true" : "false"}
              onChange={(event) =>
                setNewEdge({
                  ...newEdge,
                  injectOutput: event.target.value === "true",
                  outputMergeKey:
                    event.target.value === "true" ? newEdge.outputMergeKey : undefined,
                })
              }
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </Select>
          </div>
          {newEdge.injectOutput ? (
            <div className="space-y-2">
              <Label>Output Merge Key</Label>
              <Input
                value={newEdge.outputMergeKey ?? ""}
                onChange={(event) =>
                  setNewEdge({
                    ...newEdge,
                    outputMergeKey: event.target.value || undefined,
                  })
                }
              />
            </div>
          ) : null}
          <Button
            onClick={() => {
              if (!newEdge.fromTaskTemplateId || !newEdge.toTaskTemplateId) {
                window.alert("fromTaskTemplateId and toTaskTemplateId are required.");
                return;
              }

              createMutation.mutate({
                fromTaskTemplateId: newEdge.fromTaskTemplateId,
                toTaskTemplateId: newEdge.toTaskTemplateId,
                type: "depends_on",
                ...(newEdge.injectOutput ? { injectOutput: true } : {}),
                ...(newEdge.injectOutput && newEdge.outputMergeKey
                  ? { outputMergeKey: newEdge.outputMergeKey }
                  : {}),
              });
            }}
          >
            <Plus className="h-4 w-4" />
            Add Edge
          </Button>
        </Card>

        <Card className="space-y-4 p-6">
          <SectionHeader
            title="Edge Inventory"
            description="Composite-key edge rows with injection metadata."
          />
          <div className="space-y-3">
            {(edgesQuery.data ?? []).map((edge) => (
              <div
                key={`${edge.fromTaskTemplateId}:${edge.toTaskTemplateId}:${edge.type}`}
                className="flex flex-col gap-3 rounded-md border border-[color:var(--border)] bg-white px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="font-semibold">
                    {edge.fromTaskTemplateId} → {edge.toTaskTemplateId}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="muted">{edge.type}</Badge>
                    {edge.injectOutput ? <Badge tone="info">inject</Badge> : null}
                    {edge.outputMergeKey ? <Badge tone="warning">{edge.outputMergeKey}</Badge> : null}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => deleteMutation.mutate(edge)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            ))}
            {(edgesQuery.data ?? []).length === 0 ? (
              <EmptyState
                title="No edges yet"
                description="Add dependencies between task templates to unlock graph preview and preflight."
              />
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function DefinitionLoopPage({
  workflowDefinitionId,
}: {
  workflowDefinitionId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["task-templates", workflowDefinitionId],
    queryFn: () => api.listTaskTemplates(workflowDefinitionId),
  });
  const loopsQuery = useQuery({
    queryKey: ["loops", workflowDefinitionId],
    queryFn: () => api.listLoops(workflowDefinitionId),
  });
  const existingLoop = loopsQuery.data?.[0];
  const [draft, setDraft] = useDraftState(
    existingLoop,
    existingLoop?.loopDefinitionId ?? workflowDefinitionId,
  );

  useEffect(() => {
    if (existingLoop || draft?.loopDefinitionId || !(templatesQuery.data?.length)) {
      return;
    }

    const timestamp = createTimestamp();
    const firstTaskTemplateId = templatesQuery.data[0].taskTemplateId;
    setDraft({
      loopDefinitionId: createId("loop"),
      workflowDefinitionId,
      name: "Review Loop",
      controllerTaskTemplateId: firstTaskTemplateId,
      entryTaskTemplateIds: [firstTaskTemplateId],
      bodyTaskTemplateIds: [firstTaskTemplateId],
      maxIterations: 3,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }, [draft?.loopDefinitionId, existingLoop, setDraft, templatesQuery.data, workflowDefinitionId]);

  const saveMutation = useMutation({
    mutationFn: (payload: LoopDefinition) => api.upsertLoop(workflowDefinitionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loops", workflowDefinitionId] });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (loopDefinitionId: string) => api.deleteLoop(loopDefinitionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loops", workflowDefinitionId] });
      setDraft(undefined);
    },
    onError: (error) => window.alert(normalizeError(error)),
  });

  if (templatesQuery.isLoading || loopsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (templatesQuery.error || loopsQuery.error) {
    return (
      <ErrorState
        message={normalizeError(templatesQuery.error ?? loopsQuery.error)}
      />
    );
  }

  if ((templatesQuery.data ?? []).length === 0) {
    return (
      <EmptyState
        title="No task templates"
        description="Create tasks and graph edges first, then configure loop authoring."
      />
    );
  }

  if (!draft) {
    return <LoadingPanel />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Loop Configuration"
        description="Single-loop definition editor. Visual grouping stays on the Graph tab."
        actions={
          <>
            <Button
              onClick={() =>
                saveMutation.mutate({
                  ...draft,
                  updatedAt: createTimestamp(),
                })
              }
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
            {existingLoop ? (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Delete loop ${existingLoop.name}?`)) {
                    deleteMutation.mutate(existingLoop.loopDefinitionId);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      <Card className="space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Loop Definition ID</Label>
            <Input value={draft.loopDefinitionId} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  name: event.target.value,
                })
              }
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <LoopSelect
            label="Controller Task"
            value={draft.controllerTaskTemplateId}
            options={templatesQuery.data ?? []}
            onChange={(controllerTaskTemplateId) =>
              setDraft({
                ...draft,
                controllerTaskTemplateId,
              })
            }
          />
          <LoopMultiSelect
            label="Entry Tasks"
            value={draft.entryTaskTemplateIds}
            options={templatesQuery.data ?? []}
            onChange={(entryTaskTemplateIds) =>
              setDraft({
                ...draft,
                entryTaskTemplateIds,
              })
            }
          />
          <LoopMultiSelect
            label="Body Tasks"
            value={draft.bodyTaskTemplateIds}
            options={templatesQuery.data ?? []}
            onChange={(bodyTaskTemplateIds) =>
              setDraft({
                ...draft,
                bodyTaskTemplateIds,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Max Iterations</Label>
          <Input
            type="number"
            value={draft.maxIterations}
            onChange={(event) =>
              setDraft({
                ...draft,
                maxIterations: Math.max(1, Number(event.target.value)),
              })
            }
          />
        </div>
      </Card>
    </div>
  );
}

function LoopSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly TaskTemplate[];
  onChange: (nextValue: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((taskTemplate) => (
          <option key={taskTemplate.taskTemplateId} value={taskTemplate.taskTemplateId}>
            {taskTemplate.title}
          </option>
        ))}
      </Select>
    </div>
  );
}

function LoopMultiSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: readonly TaskTemplate[];
  onChange: (nextValue: string[]) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value=""
        onChange={(event) => {
          const nextValue = event.target.value;

          if (!nextValue || value.includes(nextValue)) {
            return;
          }

          onChange([...value, nextValue]);
        }}
      >
        <option value="">Add task</option>
        {options.map((taskTemplate) => (
          <option key={taskTemplate.taskTemplateId} value={taskTemplate.taskTemplateId}>
            {taskTemplate.title}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap gap-2">
        {value.map((entry) => (
          <button
            key={entry}
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm"
            onClick={() => onChange(value.filter((candidate) => candidate !== entry))}
          >
            {entry}
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function DefinitionSchedulesPage({
  workflowDefinitionId,
}: {
  workflowDefinitionId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const schedulesQuery = useQuery({
    queryKey: ["schedules", "definition", workflowDefinitionId],
    queryFn: () => api.listSchedules({ targetType: "workflow", targetId: workflowDefinitionId }),
  });
  const [draft, setDraft] = useState<Schedule>(() => {
    const timestamp = createTimestamp();

    return {
      scheduleId: createId("schedule"),
      type: "once",
      runAt: timestamp,
      enabled: true,
      targetType: "workflow",
      targetId: workflowDefinitionId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  const saveMutation = useMutation({
    mutationFn: (payload: Schedule) => api.upsertSchedule(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules", "definition", workflowDefinitionId] });
      setDraft(() => {
        const timestamp = createTimestamp();
        return {
          scheduleId: createId("schedule"),
          type: "once",
          runAt: timestamp,
          enabled: true,
          targetType: "workflow",
          targetId: workflowDefinitionId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => api.deleteSchedule(scheduleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules", "definition", workflowDefinitionId] });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });

  if (schedulesQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (schedulesQuery.error) {
    return <ErrorState message={normalizeError(schedulesQuery.error)} />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Create Schedule"
          description='Definition execution schedules are stored as targetType="workflow".'
        />
        <ScheduleForm draft={draft} setDraft={setDraft} targetIdLocked />
        <Button
          onClick={() =>
            saveMutation.mutate({
              ...draft,
              updatedAt: createTimestamp(),
            })
          }
        >
          <Save className="h-4 w-4" />
          Save Schedule
        </Button>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Attached Schedules"
          description="Definition-scoped automation policies. Disabled schedules still need explicit save."
        />
        <div className="space-y-3">
          {(schedulesQuery.data ?? []).map((schedule) => (
            <div
              key={schedule.scheduleId}
              className="rounded-md border border-[color:var(--border)] bg-white px-4 py-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold">{schedule.scheduleId}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {schedule.type === "once"
                      ? `runAt ${formatDateTime(schedule.runAt)}`
                      : `cron ${schedule.cronExpression} (${schedule.timezone ?? "UTC"})`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={schedule.enabled ? "success" : "warning"}>
                    {schedule.enabled ? "enabled" : "disabled"}
                  </Badge>
                  <Button variant="ghost" onClick={() => copyJson(schedule)}>
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button variant="ghost" onClick={() => setDraft(schedule)}>
                    <FileSearch className="h-4 w-4" />
                    Edit in Form
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(`Delete schedule ${schedule.scheduleId}?`)) {
                        deleteMutation.mutate(schedule.scheduleId);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {(schedulesQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No schedules attached"
              description="Create a once or cron schedule to auto-start this definition."
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function ScheduleForm({
  draft,
  setDraft,
  targetIdLocked = false,
}: {
  draft: Schedule;
  setDraft: (nextValue: Schedule) => void;
  targetIdLocked?: boolean;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Schedule ID</Label>
        <Input value={draft.scheduleId} readOnly />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={draft.type}
            onChange={(event) =>
              setDraft({
                ...draft,
                type: event.target.value as Schedule["type"],
                cronExpression: event.target.value === "cron" ? draft.cronExpression : undefined,
                runAt: event.target.value === "once" ? draft.runAt : undefined,
              })
            }
          >
            <option value="once">once</option>
            <option value="cron">cron</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Enabled</Label>
          <Select
            value={draft.enabled ? "true" : "false"}
            onChange={(event) =>
              setDraft({
                ...draft,
                enabled: event.target.value === "true",
              })
            }
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </Select>
        </div>
      </div>
      {draft.type === "once" ? (
        <div className="space-y-2">
          <Label>runAt</Label>
          <Input
            type="datetime-local"
            value={draft.runAt ? toLocalDateTimeInputValue(draft.runAt) : ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                runAt: new Date(event.target.value).toISOString(),
              })
            }
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label>cronExpression</Label>
            <Input
              value={draft.cronExpression ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  cronExpression: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>timezone</Label>
            <Input
              value={draft.timezone ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  timezone: event.target.value || undefined,
                })
              }
            />
          </div>
        </>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>targetType</Label>
          <Select
            value={draft.targetType}
            onChange={(event) =>
              setDraft({
                ...draft,
                targetType: event.target.value as Schedule["targetType"],
              })
            }
          >
            <option value="workflow">workflow</option>
            <option value="task">task</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>targetId</Label>
          <Input
            value={draft.targetId}
            readOnly={targetIdLocked}
            onChange={(event) =>
              setDraft({
                ...draft,
                targetId: event.target.value,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function DefinitionRunsPage({
  workflowDefinitionId,
}: {
  workflowDefinitionId: string;
}): JSX.Element {
  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
  });

  if (workflowsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (workflowsQuery.error) {
    return <ErrorState message={normalizeError(workflowsQuery.error)} />;
  }

  const rows = sortByUpdatedAtDescending(
    (workflowsQuery.data ?? []).filter(
      (workflow) => workflow.workflowDefinitionId === workflowDefinitionId,
    ),
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Run History"
        description="Client-side filtered runtime workflows started from this definition."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No runtime history"
          description="Start the definition to materialize runtime workflows and task graphs."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((workflow) => (
            <Link
              key={workflow.workflowId}
              to="/workflows/$workflowId"
              params={{ workflowId: workflow.workflowId }}
              className="block rounded-md border border-[color:var(--border)] bg-white px-4 py-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">{workflow.name}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {workflow.workflowId} · {formatDateTime(workflow.updatedAt)}
                  </div>
                </div>
                <Badge tone={statusTone(workflow.status)}>{workflow.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentsPage(): JSX.Element {
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
  });

  if (agentsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (agentsQuery.error) {
    return <ErrorState message={normalizeError(agentsQuery.error)} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Agents"
        description="Registry of enabled runtimes, capabilities, and adapter configs."
        actions={
          <Link to="/agents/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Agent
            </Button>
          </Link>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {(agentsQuery.data ?? []).map((agent) => (
          <Link
            key={agent.agentId}
            to="/agents/$agentId"
            params={{ agentId: agent.agentId }}
            className="block rounded-md border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-panel"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{agent.name}</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  {agent.agentId} · {agent.runtimeType}
                </div>
              </div>
              <Badge tone={agent.enabled ? "success" : "warning"}>
                {agent.enabled ? "enabled" : "disabled"}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {agent.capabilities.length === 0 ? (
                <Badge tone="muted">no capabilities</Badge>
              ) : (
                agent.capabilities.map((capability) => (
                  <Badge key={capability} tone="info">
                    {capability}
                  </Badge>
                ))
              )}
            </div>
          </Link>
        ))}
      </div>
      {(agentsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="No agents"
          description="Register at least one runtime agent before using explicit assignee or capability preflight."
        />
      ) : null}
    </div>
  );
}

export function AgentEditorPage({
  agentId,
}: {
  agentId?: string;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const agentQuery = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => api.getAgent(agentId!),
    enabled: Boolean(agentId),
  });
  const [draft, setDraft] = useState<AgentDefinition>(() => ({
    agentId: createId("agent"),
    name: "Untitled Agent",
    runtimeType: "cli",
    capabilities: [],
    enabled: true,
    config: {
      command: "node",
      args: [],
      workingDirectory: "",
      env: {},
      agentName: "planner",
    },
  }));

  useEffect(() => {
    if (agentQuery.data) {
      setDraft(agentQuery.data);
    }
  }, [agentQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: AgentDefinition) => api.upsertAgent(payload),
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      await navigate({ to: "/agents/$agentId", params: { agentId: payload.agentId } });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAgent(agentId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      await navigate({ to: "/agents" });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });

  if (agentQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (agentQuery.error) {
    return <ErrorState message={normalizeError(agentQuery.error)} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={agentId ? "Edit Agent" : "Create Agent"}
        description="Runtime-type specific config helper backed by raw JSON."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => exportJson(`${draft.agentId}.json`, draft)}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => saveMutation.mutate(draft)}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            {agentId ? (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Delete agent ${draft.name}?`)) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="space-y-5 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Agent ID</Label>
              <Input value={draft.agentId} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    name: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Runtime Type</Label>
              <Select
                value={draft.runtimeType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    runtimeType: event.target.value as AgentDefinition["runtimeType"],
                    config: defaultAgentConfig(event.target.value as AgentDefinition["runtimeType"]),
                  })
                }
              >
                <option value="cli">cli</option>
                <option value="http">http</option>
                <option value="openclaw">openclaw</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Enabled</Label>
              <Select
                value={draft.enabled ? "true" : "false"}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    enabled: event.target.value === "true",
                  })
                }
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </Select>
            </div>
          </div>

          <KeyValueEditor
            label="Capabilities"
            value={capabilityArrayToRecord(draft.capabilities)}
            onChange={(record) =>
              setDraft({
                ...draft,
                capabilities: Object.keys(record).filter(Boolean),
              })
            }
            keyPlaceholder="capability"
            valuePlaceholder="ignored"
          />

          <AgentConfigForm
            runtimeType={draft.runtimeType}
            config={draft.config}
            onChange={(config) =>
              setDraft({
                ...draft,
                config,
              })
            }
          />
        </Card>

        <Card className="space-y-4 p-6">
          <JsonEditor
            label="Raw Config"
            value={draft.config}
            onChange={(config) =>
              setDraft({
                ...draft,
                config,
              })
            }
          />
        </Card>
      </div>
    </div>
  );
}

function capabilityArrayToRecord(capabilities: readonly string[]): Record<string, string> {
  return Object.fromEntries(capabilities.map((capability) => [capability, "enabled"]));
}

function defaultAgentConfig(
  runtimeType: AgentDefinition["runtimeType"],
): Record<string, unknown> {
  switch (runtimeType) {
    case "http":
      return {
        url: "",
        headers: {},
        timeoutMs: 30_000,
        authToken: "",
        includeAgentName: false,
      };
    case "openclaw":
      return {
        command: "openclaw",
        args: ["run"],
        workingDirectory: "",
        env: {},
        agentName: "planner",
      };
    default:
      return {
        command: "node",
        args: [],
        workingDirectory: "",
        env: {},
        agentName: "planner",
      };
  }
}

function AgentConfigForm({
  runtimeType,
  config,
  onChange,
}: {
  runtimeType: AgentDefinition["runtimeType"];
  config: Record<string, unknown>;
  onChange: (nextValue: Record<string, unknown>) => void;
}): JSX.Element {
  const currentConfig = config;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Config Helper"
        description="Adapter parser-aligned helper form. Fixed fields stay hidden."
      />
      {runtimeType === "http" ? (
        <>
          <FormField
            label="URL"
            value={stringValue(currentConfig.url)}
            onChange={(url) => onChange({ ...currentConfig, url })}
          />
          <FormField
            label="authToken"
            value={stringValue(currentConfig.authToken)}
            onChange={(authToken) => onChange({ ...currentConfig, authToken })}
          />
          <FormField
            label="timeoutMs"
            type="number"
            value={`${numberValue(currentConfig.timeoutMs, 30_000)}`}
            onChange={(timeoutMs) =>
              onChange({
                ...currentConfig,
                timeoutMs: Number(timeoutMs),
              })
            }
          />
        </>
      ) : (
        <>
          <FormField
            label="command"
            value={stringValue(currentConfig.command)}
            onChange={(command) => onChange({ ...currentConfig, command })}
          />
          <FormField
            label="agentName"
            value={stringValue(currentConfig.agentName)}
            onChange={(agentName) => onChange({ ...currentConfig, agentName })}
          />
          <FormField
            label="workingDirectory"
            value={stringValue(currentConfig.workingDirectory)}
            onChange={(workingDirectory) =>
              onChange({ ...currentConfig, workingDirectory })
            }
          />
        </>
      )}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  type?: "text" | "number";
}): JSX.Element {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

export function SchedulesPage(): JSX.Element {
  const [filter, setFilter] = useState<"" | "workflow" | "task">("");
  const schedulesQuery = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.listSchedules(),
  });

  if (schedulesQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (schedulesQuery.error) {
    return <ErrorState message={normalizeError(schedulesQuery.error)} />;
  }

  const rows = sortByUpdatedAtDescending(schedulesQuery.data ?? []).filter((schedule) =>
    filter ? schedule.targetType === filter : true,
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Schedules"
        description="Once and cron schedules across definitions and advanced task targets."
        actions={
          <Link to="/schedules/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Schedule
            </Button>
          </Link>
        }
      />
      <Card className="p-4">
        <div className="w-full max-w-xs space-y-2">
          <Label>Target Filter</Label>
          <Select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="">All</option>
            <option value="workflow">workflow</option>
            <option value="task">task</option>
          </Select>
        </div>
      </Card>
      <div className="space-y-3">
        {rows.map((schedule) => (
          <Link
            key={schedule.scheduleId}
            to="/schedules/$scheduleId"
            params={{ scheduleId: schedule.scheduleId }}
            className="block rounded-md border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-panel"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{schedule.scheduleId}</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  {schedule.targetType}:{schedule.targetId}
                </div>
              </div>
              <Badge tone={schedule.enabled ? "success" : "warning"}>
                {schedule.enabled ? "enabled" : "disabled"}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No schedules found"
          description="Create a schedule or widen the current filter."
        />
      ) : null}
    </div>
  );
}

export function ScheduleEditorPage({
  scheduleId,
}: {
  scheduleId?: string;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scheduleQuery = useQuery({
    queryKey: ["schedule", scheduleId],
    queryFn: () => api.getSchedule(scheduleId!),
    enabled: Boolean(scheduleId),
  });
  const definitionsQuery = useQuery({
    queryKey: ["workflow-definitions"],
    queryFn: () => api.listWorkflowDefinitions(),
  });
  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
  });
  const [draft, setDraft] = useState<Schedule>(() => {
    const timestamp = createTimestamp();

    return {
      scheduleId: createId("schedule"),
      type: "once",
      runAt: timestamp,
      enabled: true,
      targetType: "workflow",
      targetId: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  useEffect(() => {
    if (scheduleQuery.data) {
      setDraft(scheduleQuery.data);
    }
  }, [scheduleQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Schedule) => api.upsertSchedule(payload),
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["schedules"] });
      await navigate({ to: "/schedules/$scheduleId", params: { scheduleId: payload.scheduleId } });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSchedule(scheduleId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules"] });
      await navigate({ to: "/schedules" });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });

  if (scheduleQuery.isLoading || definitionsQuery.isLoading || workflowsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (scheduleQuery.error || definitionsQuery.error || workflowsQuery.error) {
    return (
      <ErrorState
        message={normalizeError(scheduleQuery.error ?? definitionsQuery.error ?? workflowsQuery.error)}
      />
    );
  }

  const triggeredWorkflows = sortByUpdatedAtDescending(
    (workflowsQuery.data ?? []).filter(
      (workflow) => workflow.triggeredByScheduleId === draft.scheduleId,
    ),
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card className="space-y-5 p-6">
        <SectionHeader
          title={scheduleId ? "Edit Schedule" : "Create Schedule"}
          description="Explicit save model. Disabled schedules are not described as immediate unregister."
          actions={
            <>
              <Button onClick={() => saveMutation.mutate({ ...draft, updatedAt: createTimestamp() })}>
                <Save className="h-4 w-4" />
                Save
              </Button>
              {scheduleId ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Delete schedule ${draft.scheduleId}?`)) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : null}
            </>
          }
        />
        <ScheduleForm draft={draft} setDraft={setDraft} />
        <div className="space-y-2">
          <Label>Definition Picker</Label>
          <Select
            value={draft.targetId}
            onChange={(event) =>
              setDraft({
                ...draft,
                targetType: "workflow",
                targetId: event.target.value,
              })
            }
          >
            <option value="">Choose workflow definition target</option>
            {(definitionsQuery.data ?? []).map((definition) => (
              <option
                key={definition.workflowDefinitionId}
                value={definition.workflowDefinitionId}
              >
                {definition.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Triggered Workflow History"
          description="Client-side filtered because workflows lack a dedicated scheduleId filter."
        />
        <div className="space-y-3">
          {triggeredWorkflows.map((workflow) => (
            <Link
              key={workflow.workflowId}
              to="/workflows/$workflowId"
              params={{ workflowId: workflow.workflowId }}
              className="block rounded-md border border-[color:var(--border)] bg-white px-4 py-3"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">{workflow.name}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {formatDateTime(workflow.updatedAt)}
                  </div>
                </div>
                <Badge tone={statusTone(workflow.status)}>{workflow.status}</Badge>
              </div>
            </Link>
          ))}
          {triggeredWorkflows.length === 0 ? (
            <EmptyState
              title="No triggered workflows"
              description="Triggered workflow history will appear here once this schedule fires."
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
}

export function WorkflowsPage(): JSX.Element {
  const [filter, setFilter] = useState<Workflow["status"] | "">("");
  const workflowsQuery = useQuery({
    queryKey: ["workflows", filter],
    queryFn: () => api.listWorkflows(filter || undefined),
    refetchInterval: 10_000,
  });

  if (workflowsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (workflowsQuery.error) {
    return <ErrorState message={normalizeError(workflowsQuery.error)} />;
  }

  const rows = sortByUpdatedAtDescending(workflowsQuery.data ?? []);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Runtime Workflows"
        description="Monitor materialized workflow instances, trigger source, schedule provenance, and failure pressure."
      />
      <Card className="p-4">
        <div className="w-full max-w-xs space-y-2">
          <Label>Status Filter</Label>
          <Select value={filter} onChange={(event) => setFilter(event.target.value as Workflow["status"] | "")}>
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled</option>
          </Select>
        </div>
      </Card>
      <div className="space-y-3">
        {rows.map((workflow) => (
          <Link
            key={workflow.workflowId}
            to="/workflows/$workflowId"
            params={{ workflowId: workflow.workflowId }}
            className="block rounded-md border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-panel"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold">{workflow.name}</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  {workflow.workflowDefinitionId ?? "no definition"} · {workflow.triggerSource ?? "manual"} · {formatDateTime(workflow.updatedAt)}
                </div>
              </div>
              <Badge tone={statusTone(workflow.status)}>{workflow.status}</Badge>
            </div>
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No workflows"
          description="Start a definition or change the current status filter."
        />
      ) : null}
    </div>
  );
}

export function WorkflowDetailPage({
  workflowId,
}: {
  workflowId: string;
}): JSX.Element {
  const workflowQuery = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    refetchInterval: 7_500,
  });
  const tasksQuery = useQuery({
    queryKey: ["workflow", workflowId, "tasks"],
    queryFn: () => api.listWorkflowTasks(workflowId),
    refetchInterval: 7_500,
  });
  const edgesQuery = useQuery({
    queryKey: ["workflow", workflowId, "task-edges"],
    queryFn: () => api.listWorkflowTaskEdges(workflowId),
    refetchInterval: 7_500,
  });
  const loopsQuery = useQuery({
    queryKey: ["workflow-definition", workflowQuery.data?.workflowDefinitionId ?? null, "loops"],
    queryFn: () => api.listLoops(workflowQuery.data!.workflowDefinitionId!),
    enabled: Boolean(workflowQuery.data?.workflowDefinitionId),
    refetchInterval: 7_500,
  });

  const runQueries = useQueries({
    queries: (tasksQuery.data ?? []).map((task) => ({
      queryKey: ["runs", "task", task.taskId],
      queryFn: () => api.listRuns({ taskId: task.taskId }),
      refetchInterval: 10_000,
    })),
  });

  if (workflowQuery.isLoading || tasksQuery.isLoading || edgesQuery.isLoading || loopsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (workflowQuery.error || tasksQuery.error || edgesQuery.error || loopsQuery.error || !workflowQuery.data) {
    return (
      <ErrorState
        message={normalizeError(workflowQuery.error ?? tasksQuery.error ?? edgesQuery.error ?? loopsQuery.error ?? new Error("Workflow not found"))}
      />
    );
  }

  const tasks = tasksQuery.data ?? [];
  const loop = loopsQuery.data?.[0] ?? null;
  const latestRuns = new Map<string, Run | undefined>();
  runQueries.forEach((query, index) => {
    const task = tasks[index];
    if (!task) {
      return;
    }

    latestRuns.set(task.taskId, sortByUpdatedAtDescending(query.data ?? [])[0]);
  });

  const failedTasks = tasks.filter((task) => task.status === "failed");
  const downstreamBlocked = tasks.filter(
    (task) => task.status === "blocked" || task.status === "waiting",
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title={workflowQuery.data.name}
        description="Single-runtime monitoring view with graph, task stream, run history, and failure analysis."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Status" value={workflowQuery.data.status} tone={statusTone(workflowQuery.data.status)} />
        <StatCard label="Tasks" value={`${tasks.length}`} tone="accent" />
        <StatCard label="Running" value={`${tasks.filter((task) => task.status === "running").length}`} tone="info" />
        <StatCard label="Failed" value={`${failedTasks.length}`} tone="danger" />
        <StatCard label="Waiting / Blocked" value={`${downstreamBlocked.length}`} tone="warning" />
      </div>

      <Card className="space-y-4 p-6">
        <SectionHeader title="Summary" description="High-level runtime workflow metadata." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {fieldSection("Workflow ID", workflowQuery.data.workflowId)}
          {fieldSection("Trigger Source", workflowQuery.data.triggerSource ?? "manual")}
          {fieldSection("Schedule", workflowQuery.data.triggeredByScheduleId ?? "—")}
          {fieldSection("Definition", workflowQuery.data.workflowDefinitionId ?? "—")}
          {fieldSection("Started At", formatDateTime(workflowQuery.data.startedAt))}
          {fieldSection("Updated At", formatDateTime(workflowQuery.data.updatedAt))}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Runtime Graph"
          description="Task status, generation source, iteration markers, and injection edges."
        />
        <RuntimeGraph tasks={tasks} edges={edgesQuery.data ?? []} loop={loop} />
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader title="Tasks" description="Runtime task inventory with assignee, generation source, and quick navigation." />
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.taskId}
              to="/tasks/$taskId"
              params={{ taskId: task.taskId }}
              className="block rounded-md border border-[color:var(--border)] bg-white px-4 py-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold">{task.title}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {task.taskId} · {task.assigneeAgentId ?? "no assignee"} · {task.generationSource ?? "definition"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                  {task.iteration !== undefined && task.iteration !== null ? (
                    <Badge tone="warning">iteration {task.iteration}</Badge>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Runs"
          description="Task-scoped run summaries. Full N+1 histories remain lazy by task detail."
        />
        <div className="space-y-3">
          {tasks.map((task) => {
            const latestRun = latestRuns.get(task.taskId);

            return (
              <div
                key={task.taskId}
                className="flex flex-col gap-3 rounded-md border border-[color:var(--border)] bg-white px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-semibold">{task.title}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    latest run {latestRun?.runId ?? "—"} · {formatDateTime(latestRun?.updatedAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={statusTone(latestRun?.status ?? "queued")}>
                    {latestRun?.status ?? "no runs"}
                  </Badge>
                  {latestRun ? (
                    <Link to="/runs/$runId" params={{ runId: latestRun.runId }}>
                      <Button variant="ghost">Open Run</Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Failure Analysis"
          description="Failed task spotlight with persisted payload and downstream impact."
        />
        {failedTasks.length === 0 ? (
          <EmptyState
            title="No failed tasks"
            description="This workflow currently has no failed tasks."
          />
        ) : (
          <div className="space-y-4">
            {failedTasks.map((task) => {
              const latestRun = latestRuns.get(task.taskId);

              return (
                <Card key={task.taskId} className="space-y-3 border-[color:var(--danger)]/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold">{task.title}</div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">
                        assignee {task.assigneeAgentId ?? "—"} · persisted payload shown below
                      </div>
                    </div>
                    <Badge tone="danger">failed</Badge>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <pre className="overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
                      {asPrettyJson(task.payload)}
                    </pre>
                    <pre className="overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
                      {asPrettyJson(latestRun?.output ?? { error: latestRun?.error ?? "No run payload captured" })}
                    </pre>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export function TaskDetailPage({
  taskId,
}: {
  taskId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api.getTask(taskId),
    refetchInterval: 5_000,
  });
  const dependenciesQuery = useQuery({
    queryKey: ["task", taskId, "dependencies"],
    queryFn: () => api.listTaskDependencies(taskId),
    enabled: Boolean(taskId),
  });
  const dependentsQuery = useQuery({
    queryKey: ["task", taskId, "dependents"],
    queryFn: () => api.listTaskDependents(taskId),
    enabled: Boolean(taskId),
  });
  const runsQuery = useQuery({
    queryKey: ["runs", "task", taskId],
    queryFn: () => api.listRuns({ taskId }),
    refetchInterval: 5_000,
  });
  const dispatchMutation = useMutation({
    mutationFn: () => api.dispatchTask(taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      await queryClient.invalidateQueries({ queryKey: ["runs", "task", taskId] });
    },
    onError: (error) => window.alert(normalizeError(error)),
  });

  if (taskQuery.isLoading || dependenciesQuery.isLoading || dependentsQuery.isLoading || runsQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (taskQuery.error || dependenciesQuery.error || dependentsQuery.error || runsQuery.error || !taskQuery.data) {
    return (
      <ErrorState
        message={normalizeError(taskQuery.error ?? dependenciesQuery.error ?? dependentsQuery.error ?? runsQuery.error ?? new Error("Task not found"))}
      />
    );
  }

  const task = taskQuery.data;
  const latestRun = sortByUpdatedAtDescending(runsQuery.data ?? [])[0];

  return (
    <div className="space-y-6">
      <SectionHeader
        title={task.title}
        description="Single-task drilldown across payload, dependencies, runs, and runtime provenance."
        actions={
          task.status === "ready" ? (
            <Button onClick={() => dispatchMutation.mutate()}>
              <Play className="h-4 w-4" />
              Dispatch
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            {fieldSection("Task ID", task.taskId)}
            {fieldSection("Status", <Badge tone={statusTone(task.status)}>{task.status}</Badge>)}
            {fieldSection("Assignee", task.assigneeAgentId ?? "—")}
            {fieldSection("Retry Count", `${task.retryCount}`)}
            {fieldSection("Generation Source", task.generationSource ?? "definition")}
            {fieldSection("Iteration", task.iteration ?? "—")}
            {fieldSection("Spawned From", task.spawnedFromTaskId ?? "—")}
            {fieldSection("Concurrency Key", task.concurrencyKey ?? "—")}
          </div>
          <JsonEditor label="Payload" value={task.payload} onChange={() => undefined} />
          <JsonEditor label="Metadata" value={task.metadata ?? {}} onChange={() => undefined} />
        </Card>
        <Card className="space-y-4 p-6">
          <SectionHeader title="Task Graph Context" description="Dependency and dependent edges around the current task." />
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                Dependencies
              </div>
              <div className="mt-2 space-y-2">
                {(dependenciesQuery.data ?? []).map((edge) => (
                  <div key={`${edge.fromTaskId}:${edge.toTaskId}`} className="rounded-md border border-[color:var(--border)] bg-white px-3 py-3 text-sm">
                    {edge.fromTaskId} → {edge.toTaskId}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                Dependents
              </div>
              <div className="mt-2 space-y-2">
                {(dependentsQuery.data ?? []).map((edge) => (
                  <div key={`${edge.fromTaskId}:${edge.toTaskId}`} className="rounded-md border border-[color:var(--border)] bg-white px-3 py-3 text-sm">
                    {edge.fromTaskId} → {edge.toTaskId}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-[color:var(--border)] bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
              Latest Run Snapshot
            </div>
            <div className="mt-2 text-sm">
              {latestRun ? (
                <>
                  <Badge tone={statusTone(latestRun.status)}>{latestRun.status}</Badge>
                  <div className="mt-3 text-xs text-[color:var(--muted)]">
                    {latestRun.runId} · {formatDateTime(latestRun.updatedAt)}
                  </div>
                </>
              ) : (
                "No runs yet."
              )}
            </div>
          </div>
        </Card>
      </div>
      <Card className="space-y-4 p-6">
        <SectionHeader title="Run History" description="Per-task run attempts. Full payload diff remains Phase 4." />
        <div className="space-y-3">
          {(runsQuery.data ?? []).map((run) => (
            <Link
              key={run.runId}
              to="/runs/$runId"
              params={{ runId: run.runId }}
              className="block rounded-md border border-[color:var(--border)] bg-white px-4 py-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">{run.runId}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {formatDateTime(run.startedAt)} → {formatDateTime(run.finishedAt)}
                  </div>
                </div>
                <Badge tone={statusTone(run.status)}>{run.status}</Badge>
              </div>
            </Link>
          ))}
          {(runsQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No runs"
              description="Dispatch this task or wait for its workflow to progress."
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
}

export function RunDetailPage({
  runId,
}: {
  runId: string;
}): JSX.Element {
  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: 5_000,
  });

  if (runQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (runQuery.error || !runQuery.data) {
    return <ErrorState message={normalizeError(runQuery.error ?? new Error("Run not found"))} />;
  }

  const run = runQuery.data;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Run ${run.runId}`}
        description="Detailed execution attempt payload, timestamps, output, and error body."
        actions={
          <Button variant="secondary" onClick={() => copyJson(run)}>
            <Copy className="h-4 w-4" />
            Copy JSON
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            {fieldSection("Status", <Badge tone={statusTone(run.status)}>{run.status}</Badge>)}
            {fieldSection("Task", run.taskId)}
            {fieldSection("Agent", run.agentId)}
            {fieldSection("Started", formatDateTime(run.startedAt))}
            {fieldSection("Finished", formatDateTime(run.finishedAt))}
            {fieldSection("Timeout", run.status === "timeout" ? "Yes" : "No")}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <Label>Output</Label>
              <pre className="min-h-64 overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
                {asPrettyJson(run.output ?? {})}
              </pre>
            </div>
            <div className="space-y-2">
              <Label>Error</Label>
              <pre className="min-h-64 overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
                {run.error ?? "—"}
              </pre>
            </div>
          </div>
        </Card>
        <Card className="space-y-4 p-6">
          <SectionHeader title="Navigation" description="Jump back into task or workflow analysis." />
          <div className="grid gap-3">
            <Link to="/tasks/$taskId" params={{ taskId: run.taskId }}>
              <Button variant="secondary" className="w-full justify-between">
                Open Task
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function toLocalDateTimeInputValue(value: string): string {
  const date = new Date(value);
  const pad = (entry: number) => entry.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
