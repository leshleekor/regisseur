import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  Schedule,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
  WorkflowDefinition,
} from "@regisseur/core";

import { buildApp } from "./app.js";
import { createServerDependencies } from "./plugins/repositories.js";
import type {
  AgentsRepositoryLike,
  RunsRepositoryLike,
  SchedulesRepositoryLike,
  LoopDefinitionsRepositoryLike,
  ServerDependencies,
  TaskEdgesRepositoryLike,
  TaskTemplateEdgesRepositoryLike,
  TaskTemplatesRepositoryLike,
  TasksRepositoryLike,
  WorkflowDefinitionsRepositoryLike,
  WorkflowsRepositoryLike,
} from "./types.js";

function createAgent(
  agentId: string,
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    agentId,
    name: agentId,
    runtimeType: "cli",
    capabilities: [],
    enabled: true,
    config: {},
    ...overrides,
  };
}

function createWorkflow(
  workflowId: string,
  overrides: Partial<Workflow> = {},
): Workflow {
  return {
    workflowId,
    name: workflowId,
    status: "pending",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createTask(
  taskId: string,
  workflowId: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    taskId,
    workflowId,
    title: taskId,
    payload: {},
    status: "ready",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createSchedule(
  scheduleId: string,
  overrides: Partial<Schedule> = {},
): Schedule {
  return {
    scheduleId,
    type: "once",
    runAt: "2026-03-15T01:00:00.000Z",
    enabled: true,
    targetType: "workflow",
    targetId: "workflow-1",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createRun(
  runId: string,
  taskId: string,
  agentId: string,
  overrides: Partial<Run> = {},
): Run {
  return {
    runId,
    taskId,
    agentId,
    status: "queued",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createPgError(
  code: string,
  message = `pg error ${code}`,
): Error & {
  code: string;
} {
  const error = new Error(message) as Error & { code: string };

  error.code = code;

  return error;
}

function responseJson<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

interface TestContext {
  deps: ServerDependencies;
  state: {
    agents: Map<string, AgentDefinition>;
    workflows: Map<string, Workflow>;
    tasks: Map<string, Task>;
    taskEdges: TaskEdge[];
    workflowDefinitions: Map<string, WorkflowDefinition>;
    loopDefinitions: Map<string, LoopDefinition>;
    taskTemplates: Map<string, TaskTemplate>;
    taskTemplateEdges: TaskTemplateEdge[];
    schedules: Map<string, Schedule>;
    runs: Map<string, Run>;
  };
  callLog: string[];
  spies: {
    agents: Record<string, ReturnType<typeof vi.fn>>;
    workflows: Record<string, ReturnType<typeof vi.fn>>;
    tasks: Record<string, ReturnType<typeof vi.fn>>;
    taskEdges: Record<string, ReturnType<typeof vi.fn>>;
    workflowDefinitions: Record<string, ReturnType<typeof vi.fn>>;
    loopDefinitions: Record<string, ReturnType<typeof vi.fn>>;
    taskTemplates: Record<string, ReturnType<typeof vi.fn>>;
    taskTemplateEdges: Record<string, ReturnType<typeof vi.fn>>;
    schedules: Record<string, ReturnType<typeof vi.fn>>;
    runs: Record<string, ReturnType<typeof vi.fn>>;
    enqueueTaskDispatch: ReturnType<typeof vi.fn>;
    scheduleRegistration: {
      enqueueScheduleTrigger: ReturnType<typeof vi.fn>;
      registerCronScheduleTrigger: ReturnType<typeof vi.fn>;
    };
  };
}

function createTestContext(): TestContext {
  const state = {
    agents: new Map<string, AgentDefinition>(),
    workflows: new Map<string, Workflow>(),
    tasks: new Map<string, Task>(),
    taskEdges: [],
    workflowDefinitions: new Map<string, WorkflowDefinition>(),
    loopDefinitions: new Map<string, LoopDefinition>(),
    taskTemplates: new Map<string, TaskTemplate>(),
    taskTemplateEdges: [],
    schedules: new Map<string, Schedule>(),
    runs: new Map<string, Run>(),
  };
  const callLog: string[] = [];

  const agentsUpsert = vi.fn(async (agent: AgentDefinition) => {
    callLog.push("agents.upsert");
    state.agents.set(agent.agentId, agent);
  });
  const agentsFindAll = vi.fn(async () => {
    callLog.push("agents.findAll");
    return Array.from(state.agents.values());
  });
  const agentsFindEnabled = vi.fn(async () => {
    callLog.push("agents.findEnabled");
    return Array.from(state.agents.values()).filter((agent) => agent.enabled);
  });
  const agentsFindById = vi.fn(async (agentId: string) => {
    callLog.push("agents.findById");
    return state.agents.get(agentId) ?? null;
  });
  const agentsDeleteById = vi.fn(async (agentId: string) => {
    callLog.push("agents.deleteById");
    state.agents.delete(agentId);
  });

  const workflowsUpsert = vi.fn(async (workflow: Workflow) => {
    callLog.push("workflows.upsert");
    state.workflows.set(workflow.workflowId, workflow);
  });
  const workflowsFindAll = vi.fn(async () => {
    callLog.push("workflows.findAll");
    return Array.from(state.workflows.values());
  });
  const workflowsFindByStatus = vi.fn(async (status: Workflow["status"]) => {
    callLog.push("workflows.findByStatus");
    return Array.from(state.workflows.values()).filter(
      (workflow) => workflow.status === status,
    );
  });
  const workflowsFindById = vi.fn(async (workflowId: string) => {
    callLog.push("workflows.findById");
    return state.workflows.get(workflowId) ?? null;
  });
  const workflowsDeleteById = vi.fn(async (workflowId: string) => {
    callLog.push("workflows.deleteById");
    state.workflows.delete(workflowId);
  });

  const tasksUpsert = vi.fn(async (task: Task) => {
    callLog.push("tasks.upsert");
    state.tasks.set(task.taskId, task);
  });
  const tasksFindByWorkflowId = vi.fn(async (workflowId: string) => {
    callLog.push("tasks.findByWorkflowId");
    return Array.from(state.tasks.values()).filter(
      (task) => task.workflowId === workflowId,
    );
  });
  const tasksFindByStatus = vi.fn(async (status: Task["status"]) => {
    callLog.push("tasks.findByStatus");
    return Array.from(state.tasks.values()).filter(
      (task) => task.status === status,
    );
  });
  const tasksCountByWorkflowIdAndGenerationSource = vi.fn(
    async (workflowId: string, source: Task["generationSource"]) => {
      callLog.push("tasks.countByWorkflowIdAndGenerationSource");
      return Array.from(state.tasks.values()).filter(
        (task) =>
          task.workflowId === workflowId && task.generationSource === source,
      ).length;
    },
  );
  const tasksFindById = vi.fn(async (taskId: string) => {
    callLog.push("tasks.findById");
    return state.tasks.get(taskId) ?? null;
  });
  const tasksDeleteById = vi.fn(async (taskId: string) => {
    callLog.push("tasks.deleteById");
    state.tasks.delete(taskId);
  });

  const workflowDefinitionsUpsert = vi.fn(
    async (workflowDefinition: WorkflowDefinition) => {
      callLog.push("workflowDefinitions.upsert");
      state.workflowDefinitions.set(
        workflowDefinition.workflowDefinitionId,
        workflowDefinition,
      );
    },
  );
  const workflowDefinitionsFindAll = vi.fn(async () => {
    callLog.push("workflowDefinitions.findAll");
    return Array.from(state.workflowDefinitions.values());
  });
  const workflowDefinitionsFindEnabled = vi.fn(async () => {
    callLog.push("workflowDefinitions.findEnabled");
    return Array.from(state.workflowDefinitions.values()).filter(
      (workflowDefinition) => workflowDefinition.enabled,
    );
  });
  const workflowDefinitionsFindById = vi.fn(
    async (workflowDefinitionId: string) => {
      callLog.push("workflowDefinitions.findById");
      return state.workflowDefinitions.get(workflowDefinitionId) ?? null;
    },
  );
  const workflowDefinitionsDeleteById = vi.fn(
    async (workflowDefinitionId: string) => {
      callLog.push("workflowDefinitions.deleteById");
      state.workflowDefinitions.delete(workflowDefinitionId);
    },
  );

  const taskTemplatesUpsert = vi.fn(async (taskTemplate: TaskTemplate) => {
    callLog.push("taskTemplates.upsert");
    state.taskTemplates.set(taskTemplate.taskTemplateId, taskTemplate);
  });
  const taskTemplatesFindByWorkflowDefinitionId = vi.fn(
    async (workflowDefinitionId: string) => {
      callLog.push("taskTemplates.findByWorkflowDefinitionId");
      return Array.from(state.taskTemplates.values()).filter(
        (taskTemplate) =>
          taskTemplate.workflowDefinitionId === workflowDefinitionId,
      );
    },
  );
  const taskTemplatesFindById = vi.fn(async (taskTemplateId: string) => {
    callLog.push("taskTemplates.findById");
    return state.taskTemplates.get(taskTemplateId) ?? null;
  });
  const taskTemplatesDeleteById = vi.fn(async (taskTemplateId: string) => {
    callLog.push("taskTemplates.deleteById");
    state.taskTemplates.delete(taskTemplateId);
  });

  const loopDefinitionsUpsert = vi.fn(
    async (loopDefinition: LoopDefinition) => {
      callLog.push("loopDefinitions.upsert");
      state.loopDefinitions.set(
        loopDefinition.loopDefinitionId,
        loopDefinition,
      );
    },
  );
  const loopDefinitionsFindByWorkflowDefinitionId = vi.fn(
    async (workflowDefinitionId: string) => {
      callLog.push("loopDefinitions.findByWorkflowDefinitionId");
      return (
        Array.from(state.loopDefinitions.values()).find(
          (loopDefinition) =>
            loopDefinition.workflowDefinitionId === workflowDefinitionId,
        ) ?? null
      );
    },
  );
  const loopDefinitionsFindById = vi.fn(async (loopDefinitionId: string) => {
    callLog.push("loopDefinitions.findById");
    return state.loopDefinitions.get(loopDefinitionId) ?? null;
  });
  const loopDefinitionsDeleteById = vi.fn(async (loopDefinitionId: string) => {
    callLog.push("loopDefinitions.deleteById");
    state.loopDefinitions.delete(loopDefinitionId);
  });

  const taskTemplateEdgesInsert = vi.fn(async (edge: TaskTemplateEdge) => {
    callLog.push("taskTemplateEdges.insert");
    state.taskTemplateEdges.push(edge);
  });
  const taskTemplateEdgesInsertMany = vi.fn(
    async (edges: readonly TaskTemplateEdge[]) => {
      callLog.push("taskTemplateEdges.insertMany");
      state.taskTemplateEdges.push(...edges);
    },
  );
  const taskTemplateEdgesFindAllByWorkflowDefinitionTaskTemplates = vi.fn(
    async (taskTemplateIds: readonly string[]) => {
      callLog.push(
        "taskTemplateEdges.findAllByWorkflowDefinitionTaskTemplates",
      );
      const taskTemplateIdSet = new Set(taskTemplateIds);

      return state.taskTemplateEdges.filter(
        (edge) =>
          taskTemplateIdSet.has(edge.fromTaskTemplateId) &&
          taskTemplateIdSet.has(edge.toTaskTemplateId),
      );
    },
  );
  const taskTemplateEdgesFindByFromTaskTemplateId = vi.fn(
    async (taskTemplateId: string) => {
      callLog.push("taskTemplateEdges.findByFromTaskTemplateId");
      return state.taskTemplateEdges.filter(
        (edge) => edge.fromTaskTemplateId === taskTemplateId,
      );
    },
  );
  const taskTemplateEdgesFindByToTaskTemplateId = vi.fn(
    async (taskTemplateId: string) => {
      callLog.push("taskTemplateEdges.findByToTaskTemplateId");
      return state.taskTemplateEdges.filter(
        (edge) => edge.toTaskTemplateId === taskTemplateId,
      );
    },
  );
  const taskTemplateEdgesDeleteByTaskTemplateId = vi.fn(
    async (taskTemplateId: string) => {
      callLog.push("taskTemplateEdges.deleteByTaskTemplateId");
      state.taskTemplateEdges = state.taskTemplateEdges.filter(
        (edge) =>
          edge.fromTaskTemplateId !== taskTemplateId &&
          edge.toTaskTemplateId !== taskTemplateId,
      );
    },
  );
  const taskTemplateEdgesDeleteEdge = vi.fn(
    async (fromTaskTemplateId: string, toTaskTemplateId: string) => {
      callLog.push("taskTemplateEdges.deleteEdge");
      state.taskTemplateEdges = state.taskTemplateEdges.filter(
        (edge) =>
          !(
            edge.fromTaskTemplateId === fromTaskTemplateId &&
            edge.toTaskTemplateId === toTaskTemplateId &&
            edge.type === "depends_on"
          ),
      );
    },
  );

  const schedulesUpsert = vi.fn(async (schedule: Schedule) => {
    callLog.push("schedules.upsert");
    state.schedules.set(schedule.scheduleId, schedule);
  });
  const taskEdgesInsert = vi.fn(async (edge: TaskEdge) => {
    callLog.push("taskEdges.insert");
    state.taskEdges.push(edge);
  });
  const taskEdgesInsertMany = vi.fn(async (edges: readonly TaskEdge[]) => {
    callLog.push("taskEdges.insertMany");
    state.taskEdges.push(...edges);
  });
  const taskEdgesFindAllByWorkflowTasks = vi.fn(
    async (taskIds: readonly string[]) => {
      callLog.push("taskEdges.findAllByWorkflowTasks");
      const taskIdSet = new Set(taskIds);

      return state.taskEdges.filter(
        (edge) =>
          taskIdSet.has(edge.fromTaskId) && taskIdSet.has(edge.toTaskId),
      );
    },
  );
  const taskEdgesFindByFromTaskId = vi.fn(async (taskId: string) => {
    callLog.push("taskEdges.findByFromTaskId");
    return state.taskEdges.filter((edge) => edge.fromTaskId === taskId);
  });
  const taskEdgesFindByToTaskId = vi.fn(async (taskId: string) => {
    callLog.push("taskEdges.findByToTaskId");
    return state.taskEdges.filter((edge) => edge.toTaskId === taskId);
  });
  const taskEdgesDeleteByTaskId = vi.fn(async (taskId: string) => {
    callLog.push("taskEdges.deleteByTaskId");
    state.taskEdges = state.taskEdges.filter(
      (edge) => edge.fromTaskId !== taskId && edge.toTaskId !== taskId,
    );
  });
  const taskEdgesDeleteEdge = vi.fn(
    async (fromTaskId: string, toTaskId: string) => {
      callLog.push("taskEdges.deleteEdge");
      state.taskEdges = state.taskEdges.filter(
        (edge) =>
          !(
            edge.fromTaskId === fromTaskId &&
            edge.toTaskId === toTaskId &&
            edge.type === "depends_on"
          ),
      );
    },
  );
  const schedulesFindAll = vi.fn(async () => {
    callLog.push("schedules.findAll");
    return Array.from(state.schedules.values());
  });
  const schedulesFindEnabled = vi.fn(async () => {
    callLog.push("schedules.findEnabled");
    return Array.from(state.schedules.values()).filter(
      (schedule) => schedule.enabled,
    );
  });
  const schedulesFindByTarget = vi.fn(
    async (targetType: Schedule["targetType"], targetId: string) => {
      callLog.push("schedules.findByTarget");
      return Array.from(state.schedules.values()).filter(
        (schedule) =>
          schedule.targetType === targetType && schedule.targetId === targetId,
      );
    },
  );
  const schedulesFindById = vi.fn(async (scheduleId: string) => {
    callLog.push("schedules.findById");
    return state.schedules.get(scheduleId) ?? null;
  });
  const schedulesDeleteById = vi.fn(async (scheduleId: string) => {
    callLog.push("schedules.deleteById");
    state.schedules.delete(scheduleId);
  });

  const runsUpsert = vi.fn(async (run: Run) => {
    callLog.push("runs.upsert");
    state.runs.set(run.runId, run);
  });
  const runsFindByTaskId = vi.fn(async (taskId: string) => {
    callLog.push("runs.findByTaskId");
    return Array.from(state.runs.values()).filter(
      (run) => run.taskId === taskId,
    );
  });
  const runsFindByAgentId = vi.fn(async (agentId: string) => {
    callLog.push("runs.findByAgentId");
    return Array.from(state.runs.values()).filter(
      (run) => run.agentId === agentId,
    );
  });
  const runsFindByStatus = vi.fn(async (status: Run["status"]) => {
    callLog.push("runs.findByStatus");
    return Array.from(state.runs.values()).filter(
      (run) => run.status === status,
    );
  });
  const runsFindById = vi.fn(async (runId: string) => {
    callLog.push("runs.findById");
    return state.runs.get(runId) ?? null;
  });
  const runsDeleteById = vi.fn(async (runId: string) => {
    callLog.push("runs.deleteById");
    state.runs.delete(runId);
  });

  const agentsRepository: AgentsRepositoryLike = {
    upsert: agentsUpsert,
    findAll: agentsFindAll,
    findEnabled: agentsFindEnabled,
    findById: agentsFindById,
    deleteById: agentsDeleteById,
  };
  const workflowsRepository: WorkflowsRepositoryLike = {
    upsert: workflowsUpsert,
    findAll: workflowsFindAll,
    findByStatus: workflowsFindByStatus,
    findById: workflowsFindById,
    deleteById: workflowsDeleteById,
  };
  const tasksRepository: TasksRepositoryLike = {
    upsert: tasksUpsert,
    findByWorkflowId: tasksFindByWorkflowId,
    findByStatus: tasksFindByStatus,
    countByWorkflowIdAndGenerationSource:
      tasksCountByWorkflowIdAndGenerationSource,
    findById: tasksFindById,
    deleteById: tasksDeleteById,
  };
  const workflowDefinitionsRepository: WorkflowDefinitionsRepositoryLike = {
    upsert: workflowDefinitionsUpsert,
    findAll: workflowDefinitionsFindAll,
    findEnabled: workflowDefinitionsFindEnabled,
    findById: workflowDefinitionsFindById,
    deleteById: workflowDefinitionsDeleteById,
  };
  const taskTemplatesRepository: TaskTemplatesRepositoryLike = {
    upsert: taskTemplatesUpsert,
    findByWorkflowDefinitionId: taskTemplatesFindByWorkflowDefinitionId,
    findById: taskTemplatesFindById,
    deleteById: taskTemplatesDeleteById,
  };
  const taskTemplateEdgesRepository: TaskTemplateEdgesRepositoryLike = {
    insert: taskTemplateEdgesInsert,
    insertMany: taskTemplateEdgesInsertMany,
    findAllByWorkflowDefinitionTaskTemplates:
      taskTemplateEdgesFindAllByWorkflowDefinitionTaskTemplates,
    findByFromTaskTemplateId: taskTemplateEdgesFindByFromTaskTemplateId,
    findByToTaskTemplateId: taskTemplateEdgesFindByToTaskTemplateId,
    deleteByTaskTemplateId: taskTemplateEdgesDeleteByTaskTemplateId,
    deleteEdge: taskTemplateEdgesDeleteEdge,
  };
  const loopDefinitionsRepository: LoopDefinitionsRepositoryLike = {
    upsert: loopDefinitionsUpsert,
    findByWorkflowDefinitionId: loopDefinitionsFindByWorkflowDefinitionId,
    findById: loopDefinitionsFindById,
    deleteById: loopDefinitionsDeleteById,
  };
  const schedulesRepository: SchedulesRepositoryLike = {
    upsert: schedulesUpsert,
    findAll: schedulesFindAll,
    findEnabled: schedulesFindEnabled,
    findByTarget: schedulesFindByTarget,
    findById: schedulesFindById,
    deleteById: schedulesDeleteById,
  };
  const taskEdgesRepository: TaskEdgesRepositoryLike = {
    insert: taskEdgesInsert,
    insertMany: taskEdgesInsertMany,
    findAllByWorkflowTasks: taskEdgesFindAllByWorkflowTasks,
    findByFromTaskId: taskEdgesFindByFromTaskId,
    findByToTaskId: taskEdgesFindByToTaskId,
    deleteByTaskId: taskEdgesDeleteByTaskId,
    deleteEdge: taskEdgesDeleteEdge,
  };
  const runsRepository: RunsRepositoryLike = {
    upsert: runsUpsert,
    findByTaskId: runsFindByTaskId,
    findByAgentId: runsFindByAgentId,
    findByStatus: runsFindByStatus,
    findById: runsFindById,
    deleteById: runsDeleteById,
  };
  const enqueueTaskDispatch = vi.fn(
    async (request: { triggerSource: "manual" | "schedule" | "internal" }) => {
      callLog.push("enqueuePort.enqueueTaskDispatch");

      return {
        ok: true as const,
        jobId: `job-${request.triggerSource}`,
      };
    },
  );
  const enqueueScheduleTrigger = vi.fn(async () => {
    callLog.push("scheduleRegistration.enqueueScheduleTrigger");

    return {
      jobId: "schedule-job-1",
      jobName: "schedule.trigger",
    };
  });
  const registerCronScheduleTrigger = vi.fn(async () => {
    callLog.push("scheduleRegistration.registerCronScheduleTrigger");

    return {
      jobId: "schedule-job-1",
      jobName: "schedule.trigger",
    };
  });

  return {
    deps: createServerDependencies(
      {
        agentsRepository,
        workflowsRepository,
        tasksRepository,
        taskEdgesRepository,
        workflowDefinitionsRepository,
        loopDefinitionsRepository,
        taskTemplatesRepository,
        taskTemplateEdgesRepository,
        schedulesRepository,
        runsRepository,
      },
      {
        enqueueTaskDispatch,
      },
      {
        enqueueScheduleTrigger,
        registerCronScheduleTrigger,
      },
      false,
    ),
    state,
    callLog,
    spies: {
      agents: {
        upsert: agentsUpsert,
        findAll: agentsFindAll,
        findEnabled: agentsFindEnabled,
        findById: agentsFindById,
        deleteById: agentsDeleteById,
      },
      workflows: {
        upsert: workflowsUpsert,
        findAll: workflowsFindAll,
        findByStatus: workflowsFindByStatus,
        findById: workflowsFindById,
        deleteById: workflowsDeleteById,
      },
      tasks: {
        upsert: tasksUpsert,
        findByWorkflowId: tasksFindByWorkflowId,
        findByStatus: tasksFindByStatus,
        findById: tasksFindById,
        deleteById: tasksDeleteById,
      },
      taskEdges: {
        insert: taskEdgesInsert,
        insertMany: taskEdgesInsertMany,
        findAllByWorkflowTasks: taskEdgesFindAllByWorkflowTasks,
        findByFromTaskId: taskEdgesFindByFromTaskId,
        findByToTaskId: taskEdgesFindByToTaskId,
        deleteByTaskId: taskEdgesDeleteByTaskId,
        deleteEdge: taskEdgesDeleteEdge,
      },
      workflowDefinitions: {
        upsert: workflowDefinitionsUpsert,
        findAll: workflowDefinitionsFindAll,
        findEnabled: workflowDefinitionsFindEnabled,
        findById: workflowDefinitionsFindById,
        deleteById: workflowDefinitionsDeleteById,
      },
      loopDefinitions: {
        upsert: loopDefinitionsUpsert,
        findByWorkflowDefinitionId: loopDefinitionsFindByWorkflowDefinitionId,
        findById: loopDefinitionsFindById,
        deleteById: loopDefinitionsDeleteById,
      },
      taskTemplates: {
        upsert: taskTemplatesUpsert,
        findByWorkflowDefinitionId: taskTemplatesFindByWorkflowDefinitionId,
        findById: taskTemplatesFindById,
        deleteById: taskTemplatesDeleteById,
      },
      taskTemplateEdges: {
        insert: taskTemplateEdgesInsert,
        insertMany: taskTemplateEdgesInsertMany,
        findAllByWorkflowDefinitionTaskTemplates:
          taskTemplateEdgesFindAllByWorkflowDefinitionTaskTemplates,
        findByFromTaskTemplateId: taskTemplateEdgesFindByFromTaskTemplateId,
        findByToTaskTemplateId: taskTemplateEdgesFindByToTaskTemplateId,
        deleteByTaskTemplateId: taskTemplateEdgesDeleteByTaskTemplateId,
        deleteEdge: taskTemplateEdgesDeleteEdge,
      },
      schedules: {
        upsert: schedulesUpsert,
        findAll: schedulesFindAll,
        findEnabled: schedulesFindEnabled,
        findByTarget: schedulesFindByTarget,
        findById: schedulesFindById,
        deleteById: schedulesDeleteById,
      },
      runs: {
        upsert: runsUpsert,
        findByTaskId: runsFindByTaskId,
        findByAgentId: runsFindByAgentId,
        findByStatus: runsFindByStatus,
        findById: runsFindById,
        deleteById: runsDeleteById,
      },
      enqueueTaskDispatch,
      scheduleRegistration: {
        enqueueScheduleTrigger,
        registerCronScheduleTrigger,
      },
    },
  };
}

describe("server app", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  describe("Health", () => {
    it("GET /health returns 200 with ok=true", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<{ ok: true }>(response)).toEqual({ ok: true });
    });

    it("health route does not require external dependencies to be touched", async () => {
      const ctx = createTestContext();
      ctx.deps.agentsRepository.findAll = vi.fn(async () => {
        throw new Error("should not be called");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<{ ok: true }>(response)).toEqual({ ok: true });
      expect(ctx.deps.agentsRepository.findAll).not.toHaveBeenCalled();
    });
  });

  describe("Agents API", () => {
    it("POST /agents upserts a valid agent and returns 200", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const agent = createAgent("agent-1", {
        capabilities: ["shell"],
        config: { path: "/tmp" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: agent,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<AgentDefinition>(response)).toEqual(agent);
      expect(ctx.spies.agents.upsert).toHaveBeenCalledWith(agent);
    });

    it("POST /agents returns 400 when required fields are missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          agentId: "agent-1",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("BAD_REQUEST");
    });

    it("POST /agents returns 400 for invalid runtimeType", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          ...createAgent("agent-1"),
          runtimeType: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /agents returns 400 when capabilities is not an array", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          ...createAgent("agent-1"),
          capabilities: "not-an-array",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /agents returns 400 when config is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          ...createAgent("agent-1"),
          config: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /agents returns the full list without reordering", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-2", createAgent("agent-2"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents",
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(responseJson(response))).toBe(true);
      expect(
        responseJson<AgentDefinition[]>(response).map((agent) => agent.agentId),
      ).toEqual(["agent-2", "agent-1"]);
      expect(ctx.spies.agents.findAll).toHaveBeenCalledTimes(1);
    });

    it("GET /agents?enabled=true uses the enabled filter", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.state.agents.set(
        "agent-2",
        createAgent("agent-2", { enabled: false }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents?enabled=true",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<AgentDefinition[]>(response).map((agent) => agent.agentId),
      ).toEqual(["agent-1"]);
      expect(ctx.spies.agents.findEnabled).toHaveBeenCalledTimes(1);
      expect(ctx.spies.agents.findAll).not.toHaveBeenCalled();
    });

    it("GET /agents?enabled=false returns 400", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents?enabled=false",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /agents/:agentId returns the matching agent", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents/agent-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<AgentDefinition>(response).agentId).toBe("agent-1");
    });

    it("GET /agents/:agentId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents/missing",
      });

      expect(response.statusCode).toBe(404);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("NOT_FOUND");
    });

    it("DELETE /agents/:agentId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/agents/agent-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
      expect(ctx.state.agents.has("agent-1")).toBe(false);
    });

    it("DELETE /agents/:agentId keeps the no-op 204 policy for missing ids", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/agents/missing",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });
  });

  describe("Workflows API", () => {
    it("POST /workflows succeeds with a valid workflow", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const workflow = createWorkflow("workflow-1", {
        metadata: { source: "test" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        payload: workflow,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Workflow>(response)).toEqual(workflow);
      expect(ctx.spies.workflows.upsert).toHaveBeenCalledWith(workflow);
    });

    it("POST /workflows returns 400 when a required field is missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        payload: {
          workflowId: "workflow-1",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /workflows returns 400 for invalid status", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        payload: {
          ...createWorkflow("workflow-1"),
          status: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /workflows returns 400 when metadata is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        payload: {
          ...createWorkflow("workflow-1"),
          metadata: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /workflows returns all workflows", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set("workflow-2", createWorkflow("workflow-2"));
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Workflow[]>(response).map(
          (workflow) => workflow.workflowId,
        ),
      ).toEqual(["workflow-2", "workflow-1"]);
      expect(ctx.spies.workflows.findAll).toHaveBeenCalledTimes(1);
    });

    it("GET /workflows?status=running filters by status", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set(
        "workflow-1",
        createWorkflow("workflow-1", { status: "running" }),
      );
      ctx.state.workflows.set("workflow-2", createWorkflow("workflow-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows?status=running",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Workflow[]>(response).map(
          (workflow) => workflow.workflowId,
        ),
      ).toEqual(["workflow-1"]);
      expect(ctx.spies.workflows.findByStatus).toHaveBeenCalledWith("running");
    });

    it("GET /workflows/:workflowId returns the workflow when present", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows/workflow-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Workflow>(response).workflowId).toBe("workflow-1");
    });

    it("GET /workflows/:workflowId/tasks returns runtime tasks for the workflow", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.tasks.set(
        "task-2",
        createTask("task-2", "workflow-1", {
          generationSource: "dynamic",
        }),
      );
      ctx.state.tasks.set("task-3", createTask("task-3", "workflow-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows/workflow-1/tasks",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task[]>(response).map((task) => task.taskId)).toEqual(
        ["task-1", "task-2"],
      );
      expect(ctx.spies.tasks.findByWorkflowId).toHaveBeenCalledWith(
        "workflow-1",
      );
    });

    it("GET /workflows/:workflowId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows/missing",
      });

      expect(response.statusCode).toBe(404);
    });

    it("GET /workflows/:workflowId/tasks returns 404 when workflow is missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows/missing/tasks",
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /workflows/:workflowId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/workflows/workflow-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });

    it("DELETE /workflows/:workflowId maps pg integrity errors to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.workflowsRepository.deleteById = vi.fn(async () => {
        throw createPgError("23503");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/workflows/workflow-1",
      });

      expect(response.statusCode).toBe(409);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("CONFLICT");
    });
  });

  describe("Tasks API", () => {
    it("POST /tasks succeeds with a valid task", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const task = createTask("task-1", "workflow-1", {
        payload: { x: 1 },
        metadata: { y: 2 },
      });

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: task,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task>(response)).toEqual(task);
    });

    it("POST /tasks returns 400 when required fields are missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          taskId: "task-1",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /tasks returns 400 for invalid status", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          ...createTask("task-1", "workflow-1"),
          status: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /tasks returns 400 when payload is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          ...createTask("task-1", "workflow-1"),
          payload: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /tasks returns 400 when metadata is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          ...createTask("task-1", "workflow-1"),
          metadata: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /tasks?workflowId=... delegates to findByWorkflowId", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.tasks.set("task-2", createTask("task-2", "workflow-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks?workflowId=workflow-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task[]>(response).map((task) => task.taskId)).toEqual(
        ["task-1"],
      );
      expect(ctx.spies.tasks.findByWorkflowId).toHaveBeenCalledWith(
        "workflow-1",
      );
      expect(ctx.spies.tasks.findByStatus).not.toHaveBeenCalled();
    });

    it("GET /tasks?status=ready delegates to findByStatus", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", { status: "ready" }),
      );
      ctx.state.tasks.set(
        "task-2",
        createTask("task-2", "workflow-1", { status: "running" }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks?status=ready",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task[]>(response).map((task) => task.taskId)).toEqual(
        ["task-1"],
      );
      expect(ctx.spies.tasks.findByStatus).toHaveBeenCalledWith("ready");
      expect(ctx.spies.tasks.findByWorkflowId).not.toHaveBeenCalled();
    });

    it("GET /tasks returns 400 when no filter is provided", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /tasks returns 400 when both filters are provided", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks?workflowId=workflow-1&status=ready",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /tasks/:taskId returns the task when present", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks/task-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Task>(response).taskId).toBe("task-1");
    });

    it("GET /tasks/:taskId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/tasks/missing",
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /tasks/:taskId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/tasks/task-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });

    it("DELETE /tasks/:taskId maps pg integrity errors to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.tasksRepository.deleteById = vi.fn(async () => {
        throw createPgError("23503");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/tasks/task-1",
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe("Tasks dispatch API", () => {
    it("POST /tasks/:taskId/dispatch returns 200 on success", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson(response)).toEqual({
        ok: true,
        taskId: "task-1",
        workflowId: "workflow-1",
        agentId: "agent-1",
        enqueueResult: {
          ok: true,
          jobId: "job-manual",
        },
      });
      expect(ctx.spies.enqueueTaskDispatch).toHaveBeenCalledTimes(1);
      expect(ctx.spies.tasks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-1",
          status: "queued",
          assigneeAgentId: "agent-1",
          updatedAt: expect.any(String),
        }),
      );
      expect(ctx.spies.workflows.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: "workflow-1",
          status: "running",
        }),
      );
    });

    it("POST /tasks/:taskId/dispatch defaults triggerSource to manual", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(ctx.spies.enqueueTaskDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-1",
          workflowId: "workflow-1",
          agentId: "agent-1",
          triggerSource: "manual",
        }),
      );
    });

    it("POST /tasks/:taskId/dispatch forwards triggerSource to enqueue", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
        payload: {
          triggerSource: "schedule",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(ctx.spies.enqueueTaskDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerSource: "schedule",
        }),
      );
    });

    it("POST /tasks/:taskId/dispatch returns 404 when the task is missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/missing/dispatch",
      });

      expect(response.statusCode).toBe(404);
      expect(ctx.spies.enqueueTaskDispatch).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps TASK_NOT_READY to 409", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", { status: "pending" }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("TASK_NOT_READY");
      expect(ctx.spies.agents.findAll).not.toHaveBeenCalled();
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch rejects every non-ready task status", async () => {
      const blockedStatuses = [
        "pending",
        "blocked",
        "queued",
        "running",
        "succeeded",
        "failed",
      ] as const;

      for (const status of blockedStatuses) {
        const ctx = createTestContext();
        ctx.state.tasks.set(
          "task-1",
          createTask("task-1", "workflow-1", { status }),
        );
        app = buildApp(ctx.deps);

        const response = await app.inject({
          method: "POST",
          url: "/tasks/task-1/dispatch",
        });

        expect(response.statusCode).toBe(409);
        expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
        expect(ctx.spies.enqueueTaskDispatch).not.toHaveBeenCalled();

        await app.close();
        app = undefined;
      }
    });

    it("POST /tasks/:taskId/dispatch maps ASSIGNEE_NOT_FOUND to 409", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", {
          assigneeAgentId: "missing-agent",
        }),
      );
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("ASSIGNEE_NOT_FOUND");
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps ASSIGNEE_DISABLED to 409", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", {
          assigneeAgentId: "agent-1",
        }),
      );
      ctx.state.agents.set(
        "agent-1",
        createAgent("agent-1", { enabled: false }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps NO_MATCHING_AGENT to 409", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", {
          metadata: {
            requiredCapabilities: ["shell"],
          },
        }),
      );
      ctx.state.agents.set(
        "agent-1",
        createAgent("agent-1", {
          capabilities: ["http"],
        }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(ctx.spies.tasks.upsert).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch maps ENQUEUE_FAILED to 502", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.enqueuePort.enqueueTaskDispatch = vi.fn(async () => ({
        ok: false as const,
        message: "queue down",
      }));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(502);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("ENQUEUE_FAILED");
      expect(ctx.spies.tasks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "queued",
        }),
      );
    });

    it("POST /tasks/:taskId/dispatch returns 500 when queued state persistence fails", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.deps.tasksRepository.upsert = vi.fn(async () => {
        throw new Error("persist failed");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(500);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("INTERNAL_SERVER_ERROR");
      expect(ctx.spies.enqueueTaskDispatch).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch validates triggerSource", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
        payload: {
          triggerSource: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(ctx.spies.enqueueTaskDispatch).not.toHaveBeenCalled();
    });

    it("POST /tasks/:taskId/dispatch persists queued task and workflow before enqueue", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(ctx.callLog).toEqual([
        "tasks.findById",
        "agents.findAll",
        "tasks.upsert",
        "workflows.findById",
        "tasks.findByWorkflowId",
        "workflows.upsert",
        "enqueuePort.enqueueTaskDispatch",
      ]);
    });
  });

  describe("Schedules API", () => {
    it("POST /schedules accepts a once schedule", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const schedule = createSchedule("schedule-1");

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: schedule,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Schedule>(response)).toEqual(schedule);
      expect(ctx.spies.schedules.upsert).toHaveBeenCalledWith(schedule);
      expect(
        ctx.spies.scheduleRegistration.enqueueScheduleTrigger,
      ).toHaveBeenCalledTimes(1);
      expect(
        ctx.spies.scheduleRegistration.enqueueScheduleTrigger,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: "schedule-1",
          targetType: "workflow",
          targetId: "workflow-1",
          triggeredAt: expect.any(String),
        }),
        expect.objectContaining({
          delayMs: expect.any(Number),
          jobId: "schedule-1",
        }),
      );
    });

    it("POST /schedules accepts a cron schedule", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const schedule = createSchedule("schedule-1", {
        type: "cron",
        runAt: undefined,
        cronExpression: "0 * * * *",
        timezone: "Asia/Seoul",
        targetType: "task",
        targetId: "task-1",
      });

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: schedule,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Schedule>(response)).toEqual(schedule);
      expect(
        ctx.spies.scheduleRegistration.registerCronScheduleTrigger,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: "schedule-1",
          targetType: "task",
          targetId: "task-1",
          triggeredAt: expect.any(String),
        }),
        {
          cronExpression: "0 * * * *",
          jobId: "schedule-1",
          timezone: "Asia/Seoul",
        },
      );
    });

    it("POST /schedules rejects invalid once combinations", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: {
          ...createSchedule("schedule-1"),
          runAt: undefined,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /schedules rejects invalid cron combinations", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: {
          ...createSchedule("schedule-1", {
            type: "cron",
            runAt: undefined,
          }),
          cronExpression: undefined,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /schedules returns all schedules when no filter is supplied", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set("schedule-2", createSchedule("schedule-2"));
      ctx.state.schedules.set("schedule-1", createSchedule("schedule-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Schedule[]>(response).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-2", "schedule-1"]);
      expect(ctx.spies.schedules.findAll).toHaveBeenCalledTimes(1);
    });

    it("GET /schedules?enabled=true uses the enabled filter", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set("schedule-1", createSchedule("schedule-1"));
      ctx.state.schedules.set(
        "schedule-2",
        createSchedule("schedule-2", { enabled: false }),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?enabled=true",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Schedule[]>(response).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-1"]);
      expect(ctx.spies.schedules.findEnabled).toHaveBeenCalledTimes(1);
    });

    it("GET /schedules?enabled=false returns 400", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?enabled=false",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /schedules?targetType=task&targetId=t1 filters by target", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set(
        "schedule-1",
        createSchedule("schedule-1", {
          targetType: "task",
          targetId: "task-1",
        }),
      );
      ctx.state.schedules.set("schedule-2", createSchedule("schedule-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?targetType=task&targetId=task-1",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<Schedule[]>(response).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-1"]);
      expect(ctx.spies.schedules.findByTarget).toHaveBeenCalledWith(
        "task",
        "task-1",
      );
    });

    it("GET /schedules?targetType=task returns 400", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?targetType=task",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /schedules?targetId=t1 returns 400", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules?targetId=task-1",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /schedules/:scheduleId returns the schedule when present", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set("schedule-1", createSchedule("schedule-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules/schedule-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Schedule>(response).scheduleId).toBe("schedule-1");
    });

    it("GET /schedules/:scheduleId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/schedules/missing",
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /schedules/:scheduleId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.schedules.set("schedule-1", createSchedule("schedule-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/schedules/schedule-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });

    it("POST /schedules skips registration for disabled schedules", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      await app.inject({
        method: "POST",
        url: "/schedules",
        payload: createSchedule("schedule-1", { enabled: false }),
      });

      expect(ctx.spies.schedules.upsert).toHaveBeenCalledTimes(1);
      expect(
        ctx.spies.scheduleRegistration.enqueueScheduleTrigger,
      ).not.toHaveBeenCalled();
      expect(
        ctx.spies.scheduleRegistration.registerCronScheduleTrigger,
      ).not.toHaveBeenCalled();
    });

    it("POST /schedules returns 502 when registration fails after persistence", async () => {
      const ctx = createTestContext();

      ctx.spies.scheduleRegistration.enqueueScheduleTrigger.mockRejectedValueOnce(
        new Error("schedule queue unavailable"),
      );
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: createSchedule("schedule-1"),
      });

      expect(response.statusCode).toBe(502);
      expect(ctx.spies.schedules.upsert).toHaveBeenCalledTimes(1);
      expect(ctx.state.schedules.get("schedule-1")).toEqual(
        createSchedule("schedule-1"),
      );
    });
  });

  describe("Runs API", () => {
    it("POST /runs succeeds with a valid run", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);
      const run = createRun("run-1", "task-1", "agent-1", {
        output: { result: "ok" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/runs",
        payload: run,
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run>(response)).toEqual(run);
    });

    it("POST /runs returns 400 for invalid status", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/runs",
        payload: {
          ...createRun("run-1", "task-1", "agent-1"),
          status: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /runs returns 400 when output is not an object", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/runs",
        payload: {
          ...createRun("run-1", "task-1", "agent-1"),
          output: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /runs?taskId=t1 delegates to findByTaskId", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set("run-1", createRun("run-1", "task-1", "agent-1"));
      ctx.state.runs.set("run-2", createRun("run-2", "task-2", "agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs?taskId=task-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run[]>(response).map((run) => run.runId)).toEqual([
        "run-1",
      ]);
      expect(ctx.spies.runs.findByTaskId).toHaveBeenCalledWith("task-1");
    });

    it("GET /runs?agentId=a1 delegates to findByAgentId", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set("run-1", createRun("run-1", "task-1", "agent-1"));
      ctx.state.runs.set("run-2", createRun("run-2", "task-1", "agent-2"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs?agentId=agent-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run[]>(response).map((run) => run.runId)).toEqual([
        "run-1",
      ]);
      expect(ctx.spies.runs.findByAgentId).toHaveBeenCalledWith("agent-1");
    });

    it("GET /runs?status=running delegates to findByStatus", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set(
        "run-1",
        createRun("run-1", "task-1", "agent-1", { status: "running" }),
      );
      ctx.state.runs.set("run-2", createRun("run-2", "task-1", "agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs?status=running",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run[]>(response).map((run) => run.runId)).toEqual([
        "run-1",
      ]);
      expect(ctx.spies.runs.findByStatus).toHaveBeenCalledWith("running");
    });

    it("GET /runs returns 400 when no filter is provided", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /runs returns 400 when multiple filters are provided", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs?taskId=task-1&status=running",
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /runs/:runId returns the run when present", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set("run-1", createRun("run-1", "task-1", "agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs/run-1",
      });

      expect(response.statusCode).toBe(200);
      expect(responseJson<Run>(response).runId).toBe("run-1");
    });

    it("GET /runs/:runId returns 404 when missing", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/runs/missing",
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /runs/:runId returns 204", async () => {
      const ctx = createTestContext();
      ctx.state.runs.set("run-1", createRun("run-1", "task-1", "agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/runs/run-1",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });
  });

  describe("Error handling", () => {
    it("validation failures return the unified 400 error shape", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(responseJson(response)).toEqual({
        error: {
          code: "BAD_REQUEST",
          message: expect.any(String),
        },
      });
    });

    it("not found errors return the unified 404 error shape", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents/missing",
      });

      expect(response.statusCode).toBe(404);
      expect(responseJson(response)).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Agent missing not found",
        },
      });
    });

    it("pg code 23503 maps to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.agentsRepository.deleteById = vi.fn(async () => {
        throw createPgError("23503");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "DELETE",
        url: "/agents/agent-1",
      });

      expect(response.statusCode).toBe(409);
    });

    it("pg code 23505 maps to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.agentsRepository.upsert = vi.fn(async () => {
        throw createPgError("23505");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: createAgent("agent-1"),
      });

      expect(response.statusCode).toBe(409);
    });

    it("pg code 23514 maps to 409", async () => {
      const ctx = createTestContext();
      ctx.deps.schedulesRepository.upsert = vi.fn(async () => {
        throw createPgError("23514");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: createSchedule("schedule-1"),
      });

      expect(response.statusCode).toBe(409);
    });

    it("unexpected errors map to 500", async () => {
      const ctx = createTestContext();
      ctx.deps.workflowsRepository.findAll = vi.fn(async () => {
        throw new Error("boom");
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows",
      });

      expect(response.statusCode).toBe(500);
      expect(
        responseJson<{ error: { code: string } }>(response).error.code,
      ).toBe("INTERNAL_SERVER_ERROR");
    });

    it("unexpected errors do not expose a raw stack trace", async () => {
      const ctx = createTestContext();
      ctx.deps.workflowsRepository.findAll = vi.fn(async () => {
        const error = new Error("boom");
        error.stack = "sensitive stack";
        throw error;
      });
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/workflows",
      });

      expect(response.statusCode).toBe(500);
      expect(response.body.includes("sensitive stack")).toBe(false);
    });

    it("dispatch selection failures use the selection reason as the HTTP error code", async () => {
      const ctx = createTestContext();
      ctx.state.tasks.set(
        "task-1",
        createTask("task-1", "workflow-1", {
          metadata: {
            requiredCapabilities: ["shell"],
          },
        }),
      );
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(response.statusCode).toBe(409);
      expect(responseJson(response)).toEqual({
        error: {
          code: "NO_MATCHING_AGENT",
          message:
            "Task task-1 has no enabled agent matching capabilities: shell",
        },
      });
    });
  });

  describe("Dependency injection and composition", () => {
    it("buildApp creates a Fastify instance from injected dependencies", async () => {
      const ctx = createTestContext();
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
    });

    it("fake repositories and a fake enqueue port can fully drive the app", async () => {
      const ctx = createTestContext();
      ctx.state.agents.set("agent-1", createAgent("agent-1"));
      ctx.state.tasks.set("task-1", createTask("task-1", "workflow-1"));
      ctx.state.workflows.set("workflow-1", createWorkflow("workflow-1"));
      app = buildApp(ctx.deps);

      const agentsResponse = await app.inject({
        method: "GET",
        url: "/agents",
      });
      const dispatchResponse = await app.inject({
        method: "POST",
        url: "/tasks/task-1/dispatch",
      });

      expect(agentsResponse.statusCode).toBe(200);
      expect(dispatchResponse.statusCode).toBe(200);
    });

    it("route handlers use the injected repository instances", async () => {
      const ctx = createTestContext();
      ctx.deps.agentsRepository.findAll = vi.fn(async () => [
        createAgent("agent-injected"),
      ]);
      app = buildApp(ctx.deps);

      const response = await app.inject({
        method: "GET",
        url: "/agents",
      });

      expect(response.statusCode).toBe(200);
      expect(
        responseJson<AgentDefinition[]>(response).map((agent) => agent.agentId),
      ).toEqual(["agent-injected"]);
    });

    it("buildApp throws when a required dependency is missing", () => {
      expect(() =>
        buildApp({
          workflowsRepository: {} as WorkflowsRepositoryLike,
          tasksRepository: {} as TasksRepositoryLike,
          taskEdgesRepository: {} as TaskEdgesRepositoryLike,
          workflowDefinitionsRepository:
            {} as WorkflowDefinitionsRepositoryLike,
          taskTemplatesRepository: {} as TaskTemplatesRepositoryLike,
          taskTemplateEdgesRepository: {} as TaskTemplateEdgesRepositoryLike,
          schedulesRepository: {} as SchedulesRepositoryLike,
          runsRepository: {} as RunsRepositoryLike,
          enqueuePort: {
            enqueueTaskDispatch: vi.fn(),
          },
        }),
      ).toThrow("Missing dependency: agentsRepository");
    });
  });
});
