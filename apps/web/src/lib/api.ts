import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  RunStatus,
  Schedule,
  ScheduleTargetType,
  Task,
  TaskEdge,
  TaskStatus,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
  WorkflowStatus,
} from "@regisseur/core";

import { ApiError } from "./errors";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
  /\/$/,
  "",
);

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

interface TaskResetResponse {
  taskId: string;
  workflowId: string;
  status: TaskStatus;
  dispatched: boolean;
  runEnqueued: boolean;
  agentId?: string;
  dispatchFailure?: {
    reason: string;
    message: string;
  };
}

interface WorkflowStartResponse {
  workflowId: string;
  workflowDefinitionId?: string;
  status: WorkflowStatus;
  enqueuedTaskIds: string[];
  createdTaskIds: string[];
}

interface WorkflowCancelResponse {
  workflowId: string;
  status: "cancelled";
  cancelledTaskIds: string[];
  skippedRunningTaskIds: string[];
}

interface WorkflowPurgeResponse {
  workflowId: string;
  purged: boolean;
  deletedTaskCount: number;
  deletedRunCount: number;
  deletedTaskEdgeCount: number;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = response.statusText;

    try {
      const payload = (await response.json()) as ErrorEnvelope;
      code = payload.error.code;
      message = payload.error.message;
    } catch {
      // Ignore JSON parse failure and fall back to status text.
    }

    throw new ApiError(message, code, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function search(params: Record<string, string | undefined | true>): string {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    query.set(key, value === true ? "true" : value);
  });

  const result = query.toString();

  return result ? `?${result}` : "";
}

export const api = {
  health: () => requestJson<{ ok: true }>("/health"),

  listWorkflowDefinitions: (enabled?: true) =>
    requestJson<WorkflowDefinition[]>(
      `/workflow-definitions${search({ enabled })}`,
    ),
  getWorkflowDefinition: (id: string) =>
    requestJson<WorkflowDefinition>(`/workflow-definitions/${id}`),
  upsertWorkflowDefinition: (payload: WorkflowDefinition) =>
    requestJson<WorkflowDefinition>("/workflow-definitions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteWorkflowDefinition: (id: string) =>
    requestJson<void>(`/workflow-definitions/${id}`, { method: "DELETE" }),
  startWorkflowDefinition: (id: string, requestedAt?: string) =>
    requestJson<WorkflowStartResponse>(`/workflow-definitions/${id}/start`, {
      method: "POST",
      body: requestedAt ? JSON.stringify({ requestedAt }) : undefined,
    }),

  listTaskTemplates: (workflowDefinitionId: string) =>
    requestJson<TaskTemplate[]>(
      `/workflow-definitions/${workflowDefinitionId}/task-templates`,
    ),
  getTaskTemplate: (taskTemplateId: string) =>
    requestJson<TaskTemplate>(`/task-templates/${taskTemplateId}`),
  upsertTaskTemplate: (workflowDefinitionId: string, payload: TaskTemplate) =>
    requestJson<TaskTemplate>(
      `/workflow-definitions/${workflowDefinitionId}/task-templates`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  deleteTaskTemplate: (taskTemplateId: string) =>
    requestJson<void>(`/task-templates/${taskTemplateId}`, {
      method: "DELETE",
    }),

  listTaskTemplateEdges: (workflowDefinitionId: string) =>
    requestJson<TaskTemplateEdge[]>(
      `/workflow-definitions/${workflowDefinitionId}/task-template-edges`,
    ),
  createTaskTemplateEdge: (payload: TaskTemplateEdge) =>
    requestJson<TaskTemplateEdge>("/task-template-edges", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteTaskTemplateEdge: (fromTaskTemplateId: string, toTaskTemplateId: string) =>
    requestJson<void>(
      `/task-template-edges/${fromTaskTemplateId}/${toTaskTemplateId}`,
      { method: "DELETE" },
    ),

  listLoops: (workflowDefinitionId: string) =>
    requestJson<LoopDefinition[]>(
      `/workflow-definitions/${workflowDefinitionId}/loops`,
    ),
  getLoop: (loopDefinitionId: string) =>
    requestJson<LoopDefinition>(`/loops/${loopDefinitionId}`),
  upsertLoop: (workflowDefinitionId: string, payload: LoopDefinition) =>
    requestJson<LoopDefinition>(
      `/workflow-definitions/${workflowDefinitionId}/loops`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  deleteLoop: (loopDefinitionId: string) =>
    requestJson<void>(`/loops/${loopDefinitionId}`, { method: "DELETE" }),

  listAgents: (enabled?: true) =>
    requestJson<AgentDefinition[]>(`/agents${search({ enabled })}`),
  getAgent: (agentId: string) =>
    requestJson<AgentDefinition>(`/agents/${agentId}`),
  upsertAgent: (payload: AgentDefinition) =>
    requestJson<AgentDefinition>("/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteAgent: (agentId: string) =>
    requestJson<void>(`/agents/${agentId}`, { method: "DELETE" }),

  listSchedules: (filters?: {
    enabled?: true;
    targetType?: ScheduleTargetType;
    targetId?: string;
  }) =>
    requestJson<Schedule[]>(
      `/schedules${search({
        enabled: filters?.enabled,
        targetType: filters?.targetType,
        targetId: filters?.targetId,
      })}`,
    ),
  getSchedule: (scheduleId: string) =>
    requestJson<Schedule>(`/schedules/${scheduleId}`),
  upsertSchedule: (payload: Schedule) =>
    requestJson<Schedule>("/schedules", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteSchedule: (scheduleId: string) =>
    requestJson<void>(`/schedules/${scheduleId}`, { method: "DELETE" }),

  listWorkflows: (status?: WorkflowStatus) =>
    requestJson<Workflow[]>(`/workflows${search({ status })}`),
  getWorkflow: (workflowId: string) =>
    requestJson<Workflow>(`/workflows/${workflowId}`),
  upsertWorkflow: (payload: Workflow) =>
    requestJson<Workflow>("/workflows", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  cancelWorkflow: (workflowId: string) =>
    requestJson<WorkflowCancelResponse>(`/workflows/${workflowId}/cancel`, {
      method: "POST",
    }),
  purgeWorkflow: (workflowId: string) =>
    requestJson<WorkflowPurgeResponse>(`/workflows/${workflowId}/purge`, {
      method: "POST",
    }),
  listWorkflowTasks: (workflowId: string) =>
    requestJson<Task[]>(`/workflows/${workflowId}/tasks`),
  listWorkflowTaskEdges: (workflowId: string) =>
    requestJson<TaskEdge[]>(`/workflows/${workflowId}/task-edges`),

  listTasks: (filters: { workflowId?: string; status?: TaskStatus }) =>
    requestJson<Task[]>(
      `/tasks${search({
        workflowId: filters.workflowId,
        status: filters.status,
      })}`,
    ),
  getTask: (taskId: string) => requestJson<Task>(`/tasks/${taskId}`),
  dispatchTask: (taskId: string, triggerSource: "manual" | "schedule" | "internal" = "manual") =>
    requestJson<{ ok: true; taskId: string; workflowId: string; agentId: string }>(
      `/tasks/${taskId}/dispatch`,
      {
        method: "POST",
        body: JSON.stringify({ triggerSource }),
      },
    ),
  resetTask: (
    taskId: string,
    payload?: { dispatch?: boolean; triggerSource?: "manual" | "schedule" | "internal" },
  ) =>
    requestJson<TaskResetResponse>(`/tasks/${taskId}/reset`, {
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  cancelTask: (taskId: string) =>
    requestJson<Task>(`/tasks/${taskId}/cancel`, { method: "POST" }),
  listTaskDependencies: (taskId: string) =>
    requestJson<TaskEdge[]>(`/tasks/${taskId}/dependencies`),
  listTaskDependents: (taskId: string) =>
    requestJson<TaskEdge[]>(`/tasks/${taskId}/dependents`),

  listRuns: (filters: { taskId?: string; agentId?: string; status?: RunStatus }) =>
    requestJson<Run[]>(
      `/runs${search({
        taskId: filters.taskId,
        agentId: filters.agentId,
        status: filters.status,
      })}`,
    ),
  getRun: (runId: string) => requestJson<Run>(`/runs/${runId}`),
};

export type ApiClient = typeof api;
