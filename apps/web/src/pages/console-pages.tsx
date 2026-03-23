import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  Schedule,
  TaskEdge,
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
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type JSX, type ReactNode } from "react";

import { useConfirmDialog, useToast } from "@/components/app/feedback";
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
import {
  buildTaskRunSummaries,
  collectDownstreamBlockedTasks,
  payloadChanged,
  reconstructInjectedPayload,
} from "@/lib/runtime-analysis";
import { createId, createTimestamp } from "@/lib/ids";
import {
  buildWorkflowDefinitionBundle,
  cloneWorkflowDefinitionBundle,
  getRequiredCapabilities,
  parseWorkflowDefinitionImport,
  workflowDefinitionStartPreflight,
  type PreflightFinding,
  type WorkflowDefinitionBundle,
} from "@/lib/workflow-definition-tools";
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

function exportJson(filename: string, value: unknown): void {
  const blob = new Blob([asPrettyJson(value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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

function useConsoleFeedback(): {
  notifyError: (error: unknown, title?: string) => void;
  notifySuccess: (description: string, title?: string) => void;
  notifyInfo: (description: string, title?: string) => void;
  confirmAction: ReturnType<typeof useConfirmDialog>;
  copyJson: (value: unknown, title?: string) => Promise<void>;
} {
  const { pushToast } = useToast();
  const confirmAction = useConfirmDialog();

  return {
    notifyError: (error, title = "Request Failed") => {
      pushToast({
        title,
        description: normalizeError(error),
        tone: "danger",
      });
    },
    notifySuccess: (description, title = "Saved") => {
      pushToast({
        title,
        description,
        tone: "success",
      });
    },
    notifyInfo: (description, title = "Info") => {
      pushToast({
        title,
        description,
        tone: "info",
      });
    },
    confirmAction,
    copyJson: async (value, title = "Copied") => {
      try {
        await copyText(asPrettyJson(value));
        pushToast({
          title,
          description: "JSON copied to clipboard.",
          tone: "success",
        });
      } catch (error) {
        pushToast({
          title: "Copy Failed",
          description: normalizeError(error),
          tone: "danger",
        });
      }
    },
  };
}

async function persistWorkflowDefinitionBundle(bundle: WorkflowDefinitionBundle): Promise<void> {
  await api.upsertWorkflowDefinition(bundle.definition);

  await Promise.all(bundle.taskTemplates.map((taskTemplate) => api.upsertTaskTemplate(bundle.definition.workflowDefinitionId, taskTemplate)));
  await Promise.all(bundle.edges.map((edge) => api.createTaskTemplateEdge(edge)));

  if (bundle.loop) {
    await api.upsertLoop(bundle.definition.workflowDefinitionId, bundle.loop);
  }

  await Promise.all(bundle.schedules.map((schedule) => api.upsertSchedule(schedule)));
}

function buildDefinitionBundleFromQueries(input: {
  definition: WorkflowDefinition;
  taskTemplates: readonly TaskTemplate[];
  edges: readonly TaskTemplateEdge[];
  loops: readonly LoopDefinition[];
  schedules: readonly Schedule[];
}): WorkflowDefinitionBundle {
  return buildWorkflowDefinitionBundle({
    definition: input.definition,
    taskTemplates: input.taskTemplates,
    edges: input.edges,
    loop: input.loops[0] ?? null,
    schedules: input.schedules,
  });
}

function findingTone(finding: PreflightFinding): "warning" | "danger" {
  return finding.severity === "error" ? "danger" : "warning";
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
  const { notifyError, notifySuccess } = useConsoleFeedback();
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
  const [startDefinitionId, setStartDefinitionId] = useState("");
  const queryClient = useQueryClient();
  const startMutation = useMutation({
    mutationFn: (workflowDefinitionId: string) =>
      api.startWorkflowDefinition(workflowDefinitionId, createTimestamp()),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      notifySuccess("Workflow materialized. Opening runtime detail.", "Start Queued");
      await navigate({
        to: "/workflows/$workflowId",
        params: { workflowId: result.workflowId },
      });
    },
    onError: (error) => notifyError(error),
  });
  const enabledDefinitions = (definitionsQuery.data ?? []).filter((definition) => definition.enabled);

  useEffect(() => {
    if (!startDefinitionId && enabledDefinitions[0]) {
      setStartDefinitionId(enabledDefinitions[0].workflowDefinitionId);
    }
  }, [enabledDefinitions, startDefinitionId]);

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
            <Button variant="secondary" onClick={() => void navigate({ to: "/schedules/new" })}>
              <Plus className="h-4 w-4" />
              New Schedule
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
            description="Create entities quickly or launch an enabled definition directly from the dashboard."
          />
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-[color:var(--border)] bg-slate-50 p-4">
              <div className="space-y-2">
                <Label>Start Enabled Definition</Label>
                <Select
                  value={startDefinitionId}
                  onChange={(event) => setStartDefinitionId(event.target.value)}
                >
                  <option value="">Select a definition</option>
                  {enabledDefinitions.map((definition) => (
                    <option
                      key={definition.workflowDefinitionId}
                      value={definition.workflowDefinitionId}
                    >
                      {definition.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={!startDefinitionId || startMutation.isPending}
                  onClick={() => startMutation.mutate(startDefinitionId)}
                >
                  <Play className="h-4 w-4" />
                  Start Definition
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void navigate({ to: "/schedules/new" })}
                >
                  <Plus className="h-4 w-4" />
                  Create Schedule
                </Button>
              </div>
            </div>
            <div className="grid gap-3">
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notifyError, notifySuccess, confirmAction } = useConsoleFeedback();
  const [search, setSearch] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<"" | "enabled" | "disabled">("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
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
  const startMutation = useMutation({
    mutationFn: (workflowDefinitionId: string) =>
      api.startWorkflowDefinition(workflowDefinitionId, createTimestamp()),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      notifySuccess("Workflow materialized. Opening runtime detail.", "Start Queued");
      await navigate({
        to: "/workflows/$workflowId",
        params: { workflowId: result.workflowId },
      });
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: (workflowDefinitionId: string) => api.deleteWorkflowDefinition(workflowDefinitionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      notifySuccess("Workflow definition deleted.", "Deleted");
    },
    onError: (error) => notifyError(error),
  });
  const duplicateMutation = useMutation({
    mutationFn: async (definition: WorkflowDefinition) => {
      const [taskTemplates, edges, loops, schedules] = await Promise.all([
        api.listTaskTemplates(definition.workflowDefinitionId),
        api.listTaskTemplateEdges(definition.workflowDefinitionId),
        api.listLoops(definition.workflowDefinitionId),
        api.listSchedules({
          targetType: "workflow",
          targetId: definition.workflowDefinitionId,
        }),
      ]);
      const clonedBundle = cloneWorkflowDefinitionBundle(
        buildDefinitionBundleFromQueries({
          definition,
          taskTemplates,
          edges,
          loops,
          schedules,
        }),
      );

      await persistWorkflowDefinitionBundle(clonedBundle);

      return clonedBundle.definition;
    },
    onSuccess: async (definition) => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      notifySuccess("Definition duplicated with cloned tasks, edges, loop, and schedules.", "Duplicated");
      await navigate({
        to: "/workflow-definitions/$workflowDefinitionId/overview",
        params: {
          workflowDefinitionId: definition.workflowDefinitionId,
        },
      });
    },
    onError: (error) => notifyError(error),
  });
  const rows = useMemo(() => {
    return sortByUpdatedAtDescending(definitionsQuery.data ?? []).filter((definition) => {
      const haystack = `${definition.name} ${definition.description ?? ""}`.toLowerCase();
      const searchMatched = haystack.includes(search.toLowerCase());
      const enabledMatched =
        enabledFilter === ""
          ? true
          : enabledFilter === "enabled"
            ? definition.enabled
            : !definition.enabled;

      return searchMatched && enabledMatched;
    });
  }, [definitionsQuery.data, enabledFilter, search]);
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
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => duplicateMutation.mutate(row.original)}
              disabled={duplicateMutation.isPending}
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
            <Button
              variant="ghost"
              onClick={() => startMutation.mutate(row.original.workflowDefinitionId)}
              disabled={!row.original.enabled || startMutation.isPending}
            >
              <Play className="h-4 w-4" />
              Start
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  const [taskTemplates, edges, loops, schedules] = await Promise.all([
                    api.listTaskTemplates(row.original.workflowDefinitionId),
                    api.listTaskTemplateEdges(row.original.workflowDefinitionId),
                    api.listLoops(row.original.workflowDefinitionId),
                    api.listSchedules({
                      targetType: "workflow",
                      targetId: row.original.workflowDefinitionId,
                    }),
                  ]);
                  const relatedWorkflows = (workflowsQuery.data ?? []).filter(
                    (workflow) =>
                      workflow.workflowDefinitionId === row.original.workflowDefinitionId,
                  );
                  const approved = await confirmAction({
                    title: `Delete ${row.original.name}?`,
                    description: [
                      `${taskTemplates.length} task templates`,
                      `${edges.length} graph edges`,
                      `${loops.length} loop definitions`,
                      `${schedules.length} attached schedules`,
                      `${relatedWorkflows.length} runtime workflows`,
                    ].join(", "),
                    confirmLabel: "Delete Definition",
                    confirmTone: "danger",
                  });

                  if (approved) {
                    deleteMutation.mutate(row.original.workflowDefinitionId);
                  }
                } catch (error) {
                  notifyError(error);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [
      confirmAction,
      deleteMutation,
      duplicateMutation,
      notifyError,
      runtimeByDefinition,
      startMutation,
      workflowsQuery.data,
    ],
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

  async function handleImportChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const imported = parseWorkflowDefinitionImport(JSON.parse(await file.text()));
      const clonedBundle = cloneWorkflowDefinitionBundle(imported, {
        nameSuffix: "Imported",
      });

      await persistWorkflowDefinitionBundle(clonedBundle);
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      notifySuccess("Definition imported as a new cloned bundle.", "Imported");
      await navigate({
        to: "/workflow-definitions/$workflowDefinitionId/overview",
        params: {
          workflowDefinitionId: clonedBundle.definition.workflowDefinitionId,
        },
      });
    } catch (error) {
      notifyError(error, "Import Failed");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Workflow Definitions"
        description="Static authoring layer for task templates, graph edges, loops, and attached schedules."
        actions={
          <>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                void handleImportChange(event);
              }}
            />
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              <Download className="h-4 w-4" />
              Import JSON
            </Button>
            <Link to="/workflow-definitions/new">
              <Button>
                <Plus className="h-4 w-4" />
                New Definition
              </Button>
            </Link>
          </>
        }
      />
      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="w-full max-w-md">
            <Label>Search Definitions</Label>
            <Input
              value={search}
              placeholder="Search by name or description"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="w-44 space-y-2">
              <Label>Enabled Filter</Label>
              <Select
                value={enabledFilter}
                onChange={(event) =>
                  setEnabledFilter(event.target.value as typeof enabledFilter)
                }
              >
                <option value="">All</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </Select>
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
  const { notifyError, notifySuccess } = useConsoleFeedback();
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
      notifySuccess("Definition created. Continue in the overview tab.", "Created");
      await navigate({
        to: "/workflow-definitions/$workflowDefinitionId/overview",
        params: { workflowDefinitionId: payload.workflowDefinitionId },
      });
    },
    onError: (error) => notifyError(error),
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
  const { copyJson } = useConsoleFeedback();
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
            <Button
              variant="ghost"
              onClick={() => {
                void copyJson(definitionQuery.data, "Definition Copied");
              }}
            >
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
  const { confirmAction, copyJson, notifyError, notifySuccess } = useConsoleFeedback();
  const importInputRef = useRef<HTMLInputElement | null>(null);
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
      notifySuccess("Definition metadata saved.");
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteWorkflowDefinition(workflowDefinitionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      notifySuccess("Definition deleted.", "Deleted");
      await navigate({ to: "/workflow-definitions" });
    },
    onError: (error) => notifyError(error),
  });
  const startMutation = useMutation({
    mutationFn: () => api.startWorkflowDefinition(workflowDefinitionId, createTimestamp()),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      notifySuccess("Workflow materialized. Opening runtime detail.", "Start Queued");
      await navigate({ to: "/workflows/$workflowId", params: { workflowId: result.workflowId } });
    },
    onError: (error) => notifyError(error),
  });
  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const clonedBundle = cloneWorkflowDefinitionBundle(
        buildDefinitionBundleFromQueries({
          definition: draft!,
          taskTemplates: taskTemplatesQuery.data ?? [],
          edges: taskTemplateEdgesQuery.data ?? [],
          loops: loopsQuery.data ?? [],
          schedules: schedulesQuery.data ?? [],
        }),
      );

      await persistWorkflowDefinitionBundle(clonedBundle);

      return clonedBundle.definition;
    },
    onSuccess: async (definition) => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      notifySuccess("Definition duplicated with tasks, graph, loop, and schedules.", "Duplicated");
      await navigate({
        to: "/workflow-definitions/$workflowDefinitionId/overview",
        params: {
          workflowDefinitionId: definition.workflowDefinitionId,
        },
      });
    },
    onError: (error) => notifyError(error),
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
    loop: loopsQuery.data?.[0] ?? null,
  });
  const preflightErrors = preflightFindings.filter((finding) => finding.severity === "error");
  const relatedWorkflows = (workflowsQuery.data ?? []).filter(
    (workflow) => workflow.workflowDefinitionId === workflowDefinitionId,
  );

  async function handleImportChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const imported = parseWorkflowDefinitionImport(JSON.parse(await file.text()));
      const clonedBundle = cloneWorkflowDefinitionBundle(imported, {
        nameSuffix: "Imported",
      });

      await persistWorkflowDefinitionBundle(clonedBundle);
      await queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      notifySuccess("Imported definition bundle as a new definition.", "Imported");
      await navigate({
        to: "/workflow-definitions/$workflowDefinitionId/overview",
        params: {
          workflowDefinitionId: clonedBundle.definition.workflowDefinitionId,
        },
      });
    } catch (error) {
      notifyError(error, "Import Failed");
    }
  }

  return (
    <div className="space-y-6">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => {
          void handleImportChange(event);
        }}
      />
      <SectionHeader
        title="Overview"
        description="Top-level metadata, start preflight, and destructive controls for this definition."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                exportJson(
                  `${workflowDefinitionId}.bundle.json`,
                  buildDefinitionBundleFromQueries({
                    definition: draft,
                    taskTemplates: taskTemplatesQuery.data ?? [],
                    edges: taskTemplateEdgesQuery.data ?? [],
                    loops: loopsQuery.data ?? [],
                    schedules: schedulesQuery.data ?? [],
                  }),
                )
              }
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              <Download className="h-4 w-4" />
              Import JSON
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void duplicateMutation.mutateAsync();
              }}
              disabled={duplicateMutation.isPending}
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void copyJson(draft, "Definition Copied");
              }}
            >
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
                    const proceed = await confirmAction({
                      title: "Overwrite newer server state?",
                      description:
                        "The definition changed on the server. Confirm if you want to overwrite it with your local draft.",
                      confirmLabel: "Overwrite",
                      confirmTone: "warning",
                    });

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
              disabled={startMutation.isPending || preflightErrors.length > 0}
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
            description="Operator preflight including graph validation, loop checks, assignee state, and capability coverage."
          />
          {preflightFindings.length === 0 ? (
            <div className="rounded-md border border-[color:var(--success)]/25 bg-[color:var(--success)]/8 p-4 text-sm text-[color:var(--success)]">
              Definition is ready for start.
            </div>
          ) : (
            <div className="space-y-2">
              {preflightFindings.map((finding) => (
                <div
                  key={`${finding.code}:${finding.message}`}
                  className={`flex items-start gap-3 rounded-md border p-4 text-sm text-[color:var(--foreground)] ${
                    finding.severity === "error"
                      ? "border-[color:var(--danger)]/25 bg-[color:var(--danger)]/8"
                      : "border-[color:var(--warning)]/25 bg-[color:var(--warning)]/10"
                  }`}
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 ${
                      finding.severity === "error"
                        ? "text-[color:var(--danger)]"
                        : "text-[color:var(--warning)]"
                    }`}
                  />
                  <div className="space-y-1">
                    <Badge tone={findingTone(finding)}>{finding.code}</Badge>
                    <div>{finding.message}</div>
                  </div>
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
                onClick={async () => {
                  const summary = [
                    `${taskTemplatesQuery.data?.length ?? 0} task templates`,
                    `${taskTemplateEdgesQuery.data?.length ?? 0} graph edges`,
                    `${loopsQuery.data?.length ?? 0} loop definitions`,
                    `${schedulesQuery.data?.length ?? 0} attached schedules`,
                    `${relatedWorkflows.length} runtime workflows`,
                  ].join(", ");
                  const approved = await confirmAction({
                    title: `Delete ${draft.name}?`,
                    description: [
                      `Impact summary: ${summary}`,
                      schedulesQuery.data?.length
                        ? "Definition schedules still exist. Remove or review them before deleting to avoid cleanup surprises."
                        : "No attached schedules were found.",
                    ].join("\n\n"),
                    confirmLabel: "Delete Definition",
                    confirmTone: "danger",
                  });

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
  const { confirmAction, notifyError, notifySuccess } = useConsoleFeedback();
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

  async function confirmTaskTemplateDiscard(): Promise<boolean> {
    if (!taskDraftDirty) {
      return true;
    }

    return confirmAction({
      title: "Discard unsaved task template changes?",
      description: "Your current task template draft has unsaved changes.",
      confirmLabel: "Discard Changes",
      confirmTone: "warning",
    });
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
      notifySuccess("Task template saved.");
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: (taskTemplateId: string) => api.deleteTaskTemplate(taskTemplateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-templates", workflowDefinitionId] });
      setSelectedTaskTemplateId(null);
      setDraft(undefined);
      notifySuccess("Task template deleted.", "Deleted");
    },
    onError: (error) => notifyError(error),
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
              onClick={async () => {
                if (!(await confirmTaskTemplateDiscard())) {
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
              onClick={async () => {
                if (taskTemplate.taskTemplateId === selectedTaskTemplateId) {
                  return;
                }

                if (!(await confirmTaskTemplateDiscard())) {
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
                  onClick={async () => {
                    const approved = await confirmAction({
                      title: `Delete ${draft.title}?`,
                      description:
                        "This removes the task template definition. Review graph edges and loop references before deleting.",
                      confirmLabel: "Delete Task Template",
                      confirmTone: "danger",
                    });

                    if (approved) {
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
              {draft.defaultAssigneeAgentId &&
              agentsQuery.data?.find((agent) => agent.agentId === draft.defaultAssigneeAgentId)
                ?.enabled === false ? (
                <div className="text-xs text-[color:var(--warning)]">
                  Selected assignee is currently disabled and will fail preflight.
                </div>
              ) : null}
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

          <KeyValueEditor
            label="Required Capabilities"
            value={capabilityArrayToRecord(getRequiredCapabilities(draft))}
            onChange={(record) =>
              setDraft({
                ...draft,
                metadata: {
                  ...(draft.metadata ?? {}),
                  requiredCapabilities: Object.keys(record).filter(Boolean),
                },
              })
            }
            keyPlaceholder="capability"
            valuePlaceholder="required"
          />

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
  const { notifyError, notifyInfo, notifySuccess } = useConsoleFeedback();
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
      notifySuccess("Graph edge created.");
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: ({ fromTaskTemplateId, toTaskTemplateId }: TaskTemplateEdge) =>
      api.deleteTaskTemplateEdge(fromTaskTemplateId, toTaskTemplateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-template-edges", workflowDefinitionId] });
      notifySuccess("Graph edge deleted.", "Deleted");
    },
    onError: (error) => notifyError(error),
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
                notifyInfo("fromTaskTemplateId and toTaskTemplateId are required.", "Edge Incomplete");
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
  const { confirmAction, notifyError, notifySuccess } = useConsoleFeedback();
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
      notifySuccess("Loop saved.");
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: (loopDefinitionId: string) => api.deleteLoop(loopDefinitionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loops", workflowDefinitionId] });
      setDraft(undefined);
      notifySuccess("Loop deleted.", "Deleted");
    },
    onError: (error) => notifyError(error),
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
                onClick={async () => {
                  const approved = await confirmAction({
                    title: `Delete loop ${existingLoop.name}?`,
                    description:
                      "This removes the loop configuration and its graph grouping semantics.",
                    confirmLabel: "Delete Loop",
                    confirmTone: "danger",
                  });

                  if (approved) {
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
  const { confirmAction, copyJson, notifyError, notifySuccess } = useConsoleFeedback();
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
      notifySuccess("Definition schedule saved.");
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => api.deleteSchedule(scheduleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules", "definition", workflowDefinitionId] });
      notifySuccess("Definition schedule deleted.", "Deleted");
    },
    onError: (error) => notifyError(error),
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
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void copyJson(schedule, "Schedule Copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button variant="ghost" onClick={() => setDraft(schedule)}>
                    <FileSearch className="h-4 w-4" />
                    Edit in Form
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      const approved = await confirmAction({
                        title: `Delete schedule ${schedule.scheduleId}?`,
                        description:
                          "This removes the definition schedule and future automatic starts.",
                        confirmLabel: "Delete Schedule",
                        confirmTone: "danger",
                      });

                      if (approved) {
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
  const { confirmAction, notifyError, notifySuccess } = useConsoleFeedback();
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
      notifySuccess(agentId ? "Agent updated." : "Agent created.", agentId ? "Saved" : "Created");
      await navigate({ to: "/agents/$agentId", params: { agentId: payload.agentId } });
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAgent(agentId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      notifySuccess("Agent deleted.", "Deleted");
      await navigate({ to: "/agents" });
    },
    onError: (error) => notifyError(error),
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
                onClick={async () => {
                  const approved = await confirmAction({
                    title: `Delete agent ${draft.name}?`,
                    description:
                      "This removes the runtime target from explicit assignee and capability selection.",
                    confirmLabel: "Delete Agent",
                    confirmTone: "danger",
                  });

                  if (approved) {
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
  const { confirmAction, notifyError, notifySuccess } = useConsoleFeedback();
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
      notifySuccess(scheduleId ? "Schedule updated." : "Schedule created.", scheduleId ? "Saved" : "Created");
      await navigate({ to: "/schedules/$scheduleId", params: { scheduleId: payload.scheduleId } });
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSchedule(scheduleId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules"] });
      notifySuccess("Schedule deleted.", "Deleted");
      await navigate({ to: "/schedules" });
    },
    onError: (error) => notifyError(error),
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
                  onClick={async () => {
                    const approved = await confirmAction({
                      title: `Delete schedule ${draft.scheduleId}?`,
                      description: "This removes the schedule and its future trigger policy.",
                      confirmLabel: "Delete Schedule",
                      confirmTone: "danger",
                    });

                    if (approved) {
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmAction, notifyError, notifySuccess } = useConsoleFeedback();
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
  const cancelWorkflowMutation = useMutation({
    mutationFn: () => api.cancelWorkflow(workflowId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId, "tasks"] });
      notifySuccess("Workflow cancelled. Non-running tasks were moved to cancelled.", "Cancelled");
    },
    onError: (error) => notifyError(error),
  });
  const purgeWorkflowMutation = useMutation({
    mutationFn: () => api.purgeWorkflow(workflowId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      notifySuccess("Workflow runtime rows purged.", "Purged");
      await navigate({ to: "/workflows" });
    },
    onError: (error) => notifyError(error),
  });
  const dispatchTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.dispatchTask(taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId, "tasks"] });
      notifySuccess("Ready task dispatched.", "Dispatched");
    },
    onError: (error) => notifyError(error),
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
  const runsByTaskId = new Map<string, Run[]>();
  runQueries.forEach((query, index) => {
    const task = tasks[index];
    if (!task) {
      return;
    }

    runsByTaskId.set(task.taskId, query.data ?? []);
  });
  const runSummaries = buildTaskRunSummaries(runsByTaskId);
  const latestRuns = new Map<string, Run | undefined>();
  const latestSucceededRuns = new Map<string, Run | undefined>();
  runSummaries.forEach((summary, taskId) => {
    latestRuns.set(taskId, summary.latest);
    latestSucceededRuns.set(taskId, summary.latestSucceeded);
  });

  const failedTasks = tasks.filter((task) => task.status === "failed");
  const downstreamBlocked = tasks.filter(
    (task) => task.status === "blocked" || task.status === "waiting",
  );
  const terminalWorkflow = ["succeeded", "failed", "cancelled"].includes(workflowQuery.data.status);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={workflowQuery.data.name}
        description="Single-runtime monitoring view with graph, task stream, run history, and failure analysis."
        actions={
          <>
            {workflowQuery.data.workflowDefinitionId ? (
              <Link
                to="/workflow-definitions/$workflowDefinitionId/overview"
                params={{ workflowDefinitionId: workflowQuery.data.workflowDefinitionId }}
              >
                <Button variant="secondary">Open Definition</Button>
              </Link>
            ) : null}
            {!terminalWorkflow ? (
              <Button
                variant="danger"
                disabled={cancelWorkflowMutation.isPending}
                onClick={async () => {
                  const approved = await confirmAction({
                    title: `Cancel workflow ${workflowQuery.data.name}?`,
                    description:
                      "Pending, ready, blocked, waiting, and queued tasks will be cancelled. Running tasks are left as-is.",
                    confirmLabel: "Cancel Workflow",
                    confirmTone: "danger",
                  });

                  if (approved) {
                    cancelWorkflowMutation.mutate();
                  }
                }}
              >
                Cancel Workflow
              </Button>
            ) : (
              <Button
                variant="danger"
                disabled={purgeWorkflowMutation.isPending}
                onClick={async () => {
                  const approved = await confirmAction({
                    title: `Purge workflow ${workflowQuery.data.name}?`,
                    description:
                      "This permanently removes runtime workflow, task, task-edge, and run rows for this instance.",
                    confirmLabel: "Purge Workflow",
                    confirmTone: "danger",
                  });

                  if (approved) {
                    purgeWorkflowMutation.mutate();
                  }
                }}
              >
                Purge Workflow
              </Button>
            )}
          </>
        }
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
        <RuntimeGraph
          tasks={tasks}
          edges={edgesQuery.data ?? []}
          loop={loop}
          latestRunsByTaskId={latestRuns}
        />
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
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                  {task.generationSource === "dynamic" ? <Badge tone="info">spawned</Badge> : null}
                  {task.iteration !== undefined && task.iteration !== null ? (
                    <Badge tone="warning">iteration {task.iteration}</Badge>
                  ) : null}
                  {task.status === "ready" ? (
                    <Button
                      variant="ghost"
                      onClick={(event) => {
                        event.preventDefault();
                        dispatchTaskMutation.mutate(task.taskId);
                      }}
                      disabled={dispatchTaskMutation.isPending}
                    >
                      <Play className="h-4 w-4" />
                      Dispatch
                    </Button>
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
            const summary = runSummaries.get(task.taskId);
            const latestRun = summary?.latest;

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
                  {summary ? (
                    <Badge tone="muted">
                      {summary.succeeded} ok / {summary.failed} fail / {summary.timeout} timeout
                    </Badge>
                  ) : null}
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
              const injectionPreview = reconstructInjectedPayload(
                task,
                edgesQuery.data ?? [],
                latestSucceededRuns,
              );
              const blockedDependents = collectDownstreamBlockedTasks(
                task.taskId,
                tasks,
                edgesQuery.data ?? [],
              );

              return (
                <Card key={task.taskId} className="space-y-3 border-[color:var(--danger)]/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold">{task.title}</div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">
                        assignee {task.assigneeAgentId ?? "—"} · latest run {latestRun?.runId ?? "—"}
                      </div>
                    </div>
                    <Badge tone="danger">failed</Badge>
                  </div>
                  <div className="rounded-md border border-[color:var(--danger)]/15 bg-red-50 p-3 text-sm">
                    {latestRun?.error ?? "No run error payload captured."}
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <pre className="overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
                      {asPrettyJson(task.payload)}
                    </pre>
                    <pre className="overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
                      {asPrettyJson(latestRun?.output ?? { error: latestRun?.error ?? "No run payload captured" })}
                    </pre>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="space-y-3 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                        Injected Payload Preview
                      </div>
                      {payloadChanged(task.payload, injectionPreview.payload) ? (
                        <pre className="overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
                          {asPrettyJson(injectionPreview.payload)}
                        </pre>
                      ) : (
                        <div className="text-sm text-[color:var(--muted)]">
                          No upstream injection changed the persisted payload.
                        </div>
                      )}
                      {injectionPreview.applied.length > 0 ? (
                        <div className="space-y-2">
                          {injectionPreview.applied.map((entry) => (
                            <div
                              key={`${entry.fromTaskId}:${entry.outputMergeKey}`}
                              className="rounded-md border border-[color:var(--border)] bg-white px-3 py-2 text-sm"
                            >
                              {entry.fromTaskId} {"->"} {entry.outputMergeKey} via {entry.runId}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {injectionPreview.missing.length > 0 ? (
                        <div className="space-y-2">
                          {injectionPreview.missing.map((entry) => (
                            <div
                              key={`${entry.fromTaskId}:${entry.reason}`}
                              className="rounded-md border border-[color:var(--warning)]/25 bg-[color:var(--warning)]/10 px-3 py-2 text-sm"
                            >
                              {entry.fromTaskId}: {entry.reason}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </Card>
                    <Card className="space-y-3 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                        Downstream Blocked Tasks
                      </div>
                      {blockedDependents.length === 0 ? (
                        <div className="text-sm text-[color:var(--muted)]">
                          No blocked or waiting downstream tasks were found.
                        </div>
                      ) : (
                        blockedDependents.map((entry) => (
                          <div
                            key={`${entry.edge.fromTaskId}:${entry.edge.toTaskId}`}
                            className="rounded-md border border-[color:var(--border)] bg-white px-3 py-3 text-sm"
                          >
                            <div className="font-semibold">{entry.task.title}</div>
                            <div className="mt-1 text-xs text-[color:var(--muted)]">
                              blocked at edge {entry.edge.fromTaskId} {"->"} {entry.edge.toTaskId}
                            </div>
                          </div>
                        ))
                      )}
                    </Card>
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
  const { confirmAction, notifyError, notifySuccess } = useConsoleFeedback();
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
  const workflowEdgesQuery = useQuery({
    queryKey: ["workflow", taskQuery.data?.workflowId ?? null, "task-edges"],
    queryFn: () => api.listWorkflowTaskEdges(taskQuery.data!.workflowId),
    enabled: Boolean(taskQuery.data?.workflowId),
    refetchInterval: 5_000,
  });
  const dependencyRunQueries = useQueries({
    queries: (dependenciesQuery.data ?? []).map((edge) => ({
      queryKey: ["runs", "task", edge.fromTaskId],
      queryFn: () => api.listRuns({ taskId: edge.fromTaskId }),
      refetchInterval: 5_000,
    })),
  });
  const dispatchMutation = useMutation({
    mutationFn: () => api.dispatchTask(taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      await queryClient.invalidateQueries({ queryKey: ["runs", "task", taskId] });
      notifySuccess("Task dispatched.", "Dispatched");
    },
    onError: (error) => notifyError(error),
  });
  const resetMutation = useMutation({
    mutationFn: (dispatch: boolean) => api.resetTask(taskId, dispatch ? { dispatch: true } : undefined),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      await queryClient.invalidateQueries({ queryKey: ["runs", "task", taskId] });
      await queryClient.invalidateQueries({ queryKey: ["workflow", result.workflowId, "tasks"] });
      notifySuccess(
        result.dispatched
          ? "Task reset to ready and re-dispatched."
          : "Task reset to ready.",
        result.dispatched ? "Recovered + Dispatched" : "Recovered",
      );
    },
    onError: (error) => notifyError(error),
  });
  const cancelMutation = useMutation({
    mutationFn: () => api.cancelTask(taskId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      await queryClient.invalidateQueries({ queryKey: ["workflow", result.workflowId, "tasks"] });
      notifySuccess("Task cancelled.", "Cancelled");
    },
    onError: (error) => notifyError(error),
  });

  if (
    taskQuery.isLoading ||
    dependenciesQuery.isLoading ||
    dependentsQuery.isLoading ||
    runsQuery.isLoading ||
    workflowEdgesQuery.isLoading
  ) {
    return <LoadingPanel />;
  }

  if (
    taskQuery.error ||
    dependenciesQuery.error ||
    dependentsQuery.error ||
    runsQuery.error ||
    workflowEdgesQuery.error ||
    !taskQuery.data
  ) {
    return (
      <ErrorState
        message={normalizeError(taskQuery.error ?? dependenciesQuery.error ?? dependentsQuery.error ?? runsQuery.error ?? workflowEdgesQuery.error ?? new Error("Task not found"))}
      />
    );
  }

  const task = taskQuery.data;
  const latestRun = sortByUpdatedAtDescending(runsQuery.data ?? [])[0];
  const dependencySucceededRuns = new Map<string, Run | undefined>();
  dependencyRunQueries.forEach((query, index) => {
    const edge = dependenciesQuery.data?.[index];

    if (!edge) {
      return;
    }

    const summary = buildTaskRunSummaries(new Map([[edge.fromTaskId, query.data ?? []]])).get(edge.fromTaskId);
    dependencySucceededRuns.set(edge.fromTaskId, summary?.latestSucceeded);
  });
  const injectionPreview = reconstructInjectedPayload(
    task,
    workflowEdgesQuery.data ?? [],
    dependencySucceededRuns,
  );
  const canReset = task.status === "failed" || task.status === "cancelled";
  const canCancel = ["pending", "ready", "blocked", "waiting", "queued"].includes(task.status);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={task.title}
        description="Single-task drilldown across payload, dependencies, runs, and runtime provenance."
        actions={
          <>
            <Link to="/workflows/$workflowId" params={{ workflowId: task.workflowId }}>
              <Button variant="secondary">Open Workflow</Button>
            </Link>
            {task.status === "ready" ? (
              <Button onClick={() => dispatchMutation.mutate()}>
                <Play className="h-4 w-4" />
                Dispatch
              </Button>
            ) : null}
            {canReset ? (
              <>
                <Button
                  variant="secondary"
                  disabled={resetMutation.isPending}
                  onClick={() => resetMutation.mutate(false)}
                >
                  Reset to Ready
                </Button>
                <Button
                  disabled={resetMutation.isPending}
                  onClick={() => resetMutation.mutate(true)}
                >
                  Reset + Dispatch
                </Button>
              </>
            ) : null}
            {canCancel ? (
              <Button
                variant="danger"
                disabled={cancelMutation.isPending}
                onClick={async () => {
                  const approved = await confirmAction({
                    title: `Cancel task ${task.title}?`,
                    description:
                      "This moves the task to cancelled if it is not already running or terminal.",
                    confirmLabel: "Cancel Task",
                    confirmTone: "danger",
                  });

                  if (approved) {
                    cancelMutation.mutate();
                  }
                }}
              >
                Cancel Task
              </Button>
            ) : null}
          </>
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
        <SectionHeader
          title="Injection Payload Preview"
          description="Best-effort reconstruction of dispatch payload after upstream output injection."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <pre className="overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
            {asPrettyJson(task.payload)}
          </pre>
          <pre className="overflow-auto rounded-md bg-stone-950 p-4 text-xs text-stone-100">
            {asPrettyJson(injectionPreview.payload)}
          </pre>
        </div>
        {payloadChanged(task.payload, injectionPreview.payload) ? (
          <div className="rounded-md border border-[color:var(--info)]/25 bg-[color:var(--info)]/8 p-4 text-sm">
            Upstream injection changes the payload at dispatch time.
          </div>
        ) : (
          <div className="rounded-md border border-[color:var(--border)] bg-slate-50 p-4 text-sm text-[color:var(--muted)]">
            No upstream output injection changed this task payload.
          </div>
        )}
        {injectionPreview.applied.length > 0 ? (
          <div className="space-y-2">
            {injectionPreview.applied.map((entry) => (
              <div
                key={`${entry.fromTaskId}:${entry.outputMergeKey}`}
                className="rounded-md border border-[color:var(--border)] bg-white px-3 py-2 text-sm"
              >
                {entry.fromTaskId} injected into {entry.outputMergeKey} via {entry.runId}
              </div>
            ))}
          </div>
        ) : null}
        {injectionPreview.missing.length > 0 ? (
          <div className="space-y-2">
            {injectionPreview.missing.map((entry) => (
              <div
                key={`${entry.fromTaskId}:${entry.reason}`}
                className="rounded-md border border-[color:var(--warning)]/25 bg-[color:var(--warning)]/10 px-3 py-2 text-sm"
              >
                {entry.fromTaskId}: {entry.reason}
              </div>
            ))}
          </div>
        ) : null}
      </Card>
      <Card className="space-y-4 p-6">
        <SectionHeader title="Run History" description="Per-task run attempts with navigation into full run detail." />
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
  const { copyJson } = useConsoleFeedback();
  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: 5_000,
  });
  const taskQuery = useQuery({
    queryKey: ["run", runId, "task"],
    queryFn: () => api.getTask(runQuery.data!.taskId),
    enabled: Boolean(runQuery.data?.taskId),
    refetchInterval: 5_000,
  });

  if (runQuery.isLoading || taskQuery.isLoading) {
    return <LoadingPanel />;
  }

  if (runQuery.error || taskQuery.error || !runQuery.data) {
    return <ErrorState message={normalizeError(runQuery.error ?? taskQuery.error ?? new Error("Run not found"))} />;
  }

  const run = runQuery.data;
  const task = taskQuery.data;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Run ${run.runId}`}
        description="Detailed execution attempt payload, timestamps, output, and error body."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                void copyJson(run, "Run Copied");
              }}
            >
              <Copy className="h-4 w-4" />
              Copy JSON
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportJson(`${run.runId}.json`, run)}
            >
              <Download className="h-4 w-4" />
              Export JSON
            </Button>
          </>
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
            {task ? (
              <Link to="/workflows/$workflowId" params={{ workflowId: task.workflowId }}>
                <Button variant="secondary" className="w-full justify-between">
                  Open Workflow
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : null}
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
