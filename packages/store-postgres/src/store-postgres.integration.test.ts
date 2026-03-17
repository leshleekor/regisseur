import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
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

import {
  PostgresAgentsRepository,
  PostgresLoopDefinitionsRepository,
  PostgresRunsRepository,
  PostgresSchedulesRepository,
  PostgresTaskEdgesRepository,
  PostgresTaskTemplateEdgesRepository,
  PostgresTaskTemplatesRepository,
  PostgresTasksRepository,
  PostgresWorkflowDefinitionsRepository,
  PostgresWorkflowsRepository,
  createPostgresPool,
  mapAgentRowToDomain,
  mapLoopDefinitionRowToDomain,
  mapRunRowToDomain,
  mapScheduleRowToDomain,
  mapTaskRowToDomain,
  mapTaskTemplateRowToDomain,
  mapWorkflowRowToDomain,
  mapWorkflowDefinitionRowToDomain,
  runStorePostgresMigrations,
} from "./index.js";
import type {
  AgentRow,
  LoopDefinitionRow,
  RunRow,
  ScheduleRow,
  TaskRow,
  TaskTemplateRow,
  WorkflowDefinitionRow,
  WorkflowRow,
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

function createWorkflowDefinition(
  workflowDefinitionId: string,
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    workflowDefinitionId,
    name: workflowDefinitionId,
    enabled: true,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createLoopDefinition(
  workflowDefinitionId: string,
  overrides: Partial<LoopDefinition> = {},
): LoopDefinition {
  return {
    loopDefinitionId: `loop-${workflowDefinitionId}`,
    workflowDefinitionId,
    name: `Loop for ${workflowDefinitionId}`,
    controllerTaskTemplateId: "task-template-review",
    entryTaskTemplateIds: ["task-template-dev"],
    bodyTaskTemplateIds: ["task-template-dev", "task-template-review"],
    maxIterations: 3,
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
    status: "pending",
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createTaskTemplate(
  taskTemplateId: string,
  workflowDefinitionId: string,
  overrides: Partial<TaskTemplate> = {},
): TaskTemplate {
  return {
    taskTemplateId,
    workflowDefinitionId,
    title: taskTemplateId,
    payload: {},
    retryCount: 0,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
  };
}

function createTaskEdge(
  fromTaskId: string,
  toTaskId: string,
  overrides: Partial<TaskEdge> = {},
): TaskEdge {
  return {
    fromTaskId,
    toTaskId,
    type: "depends_on",
    ...overrides,
  };
}

function createTaskTemplateEdge(
  fromTaskTemplateId: string,
  toTaskTemplateId: string,
  overrides: Partial<TaskTemplateEdge> = {},
): TaskTemplateEdge {
  return {
    fromTaskTemplateId,
    toTaskTemplateId,
    type: "depends_on",
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

describe.sequential("store-postgres integration", () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let agentsRepository: PostgresAgentsRepository;
  let workflowsRepository: PostgresWorkflowsRepository;
  let workflowDefinitionsRepository: PostgresWorkflowDefinitionsRepository;
  let loopDefinitionsRepository: PostgresLoopDefinitionsRepository;
  let tasksRepository: PostgresTasksRepository;
  let taskEdgesRepository: PostgresTaskEdgesRepository;
  let taskTemplatesRepository: PostgresTaskTemplatesRepository;
  let taskTemplateEdgesRepository: PostgresTaskTemplateEdgesRepository;
  let schedulesRepository: PostgresSchedulesRepository;
  let runsRepository: PostgresRunsRepository;

  async function resetDatabase(): Promise<void> {
    await pool.query(
      `
        TRUNCATE TABLE
          runs,
          task_template_edges,
          task_edges,
          schedules,
          loop_definitions,
          task_templates,
          tasks,
          workflow_definitions,
          workflows,
          agents
        RESTART IDENTITY CASCADE
      `,
    );
  }

  beforeAll(async () => {
    container = await new GenericContainer("postgres:16-alpine")
      .withEnvironment({
        POSTGRES_DB: "regisseur_test",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_USER: "postgres",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage("database system is ready to accept connections", 2),
      )
      .withStartupTimeout(120_000)
      .start();

    pool = createPostgresPool({
      host: container.getHost(),
      port: container.getMappedPort(5432),
      user: "postgres",
      password: "postgres",
      database: "regisseur_test",
      max: 4,
    });

    await runStorePostgresMigrations(pool);

    agentsRepository = new PostgresAgentsRepository(pool);
    workflowsRepository = new PostgresWorkflowsRepository(pool);
    workflowDefinitionsRepository = new PostgresWorkflowDefinitionsRepository(
      pool,
    );
    loopDefinitionsRepository = new PostgresLoopDefinitionsRepository(pool);
    tasksRepository = new PostgresTasksRepository(pool);
    taskEdgesRepository = new PostgresTaskEdgesRepository(pool);
    taskTemplatesRepository = new PostgresTaskTemplatesRepository(pool);
    taskTemplateEdgesRepository = new PostgresTaskTemplateEdgesRepository(pool);
    schedulesRepository = new PostgresSchedulesRepository(pool);
    runsRepository = new PostgresRunsRepository(pool);
  }, 120_000);

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }

    if (container) {
      await container.stop();
    }
  }, 120_000);

  describe("migration and schema", () => {
    it("runs the init migration idempotently", async () => {
      await expect(runStorePostgresMigrations(pool)).resolves.toBeUndefined();
    });

    it("creates all required tables", async () => {
      const result = await pool.query<{
        table_name: string;
      }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
          ORDER BY table_name ASC
        `,
        [
          [
            "agents",
            "loop_definitions",
            "workflow_definitions",
            "workflows",
            "task_templates",
            "tasks",
            "task_template_edges",
            "task_edges",
            "schedules",
            "runs",
          ],
        ],
      );

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "agents",
        "loop_definitions",
        "runs",
        "schedules",
        "task_edges",
        "task_template_edges",
        "task_templates",
        "tasks",
        "workflow_definitions",
        "workflows",
      ]);
    });

    it("creates the key indexes and schedule check constraint", async () => {
      const indexes = await pool.query<{ indexname: string }>(
        `
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = ANY($1::text[])
          ORDER BY indexname ASC
        `,
        [
          [
            "idx_tasks_workflow_id",
            "idx_tasks_status",
            "idx_tasks_assignee_agent_id",
            "idx_tasks_task_template_id",
            "idx_tasks_loop_definition_id",
            "idx_tasks_iteration",
            "idx_tasks_spawned_from_task_id",
            "idx_task_edges_to_task_id",
            "idx_task_edges_from_task_id",
            "idx_workflow_definitions_enabled",
            "idx_loop_definitions_workflow_definition_id",
            "idx_loop_definitions_controller_task_template_id",
            "idx_workflows_workflow_definition_id",
            "idx_task_templates_workflow_definition_id",
            "idx_task_templates_default_assignee_agent_id",
            "idx_task_template_edges_from_task_template_id",
            "idx_task_template_edges_to_task_template_id",
            "idx_runs_task_id",
            "idx_runs_agent_id",
            "idx_runs_status",
          ],
        ],
      );
      const constraints = await pool.query<{ conname: string }>(
        `
          SELECT conname
          FROM pg_constraint
          WHERE conname = 'schedules_type_fields_check'
        `,
      );

      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "idx_loop_definitions_controller_task_template_id",
        "idx_loop_definitions_workflow_definition_id",
        "idx_runs_agent_id",
        "idx_runs_status",
        "idx_runs_task_id",
        "idx_task_edges_from_task_id",
        "idx_task_edges_to_task_id",
        "idx_task_template_edges_from_task_template_id",
        "idx_task_template_edges_to_task_template_id",
        "idx_task_templates_default_assignee_agent_id",
        "idx_task_templates_workflow_definition_id",
        "idx_tasks_assignee_agent_id",
        "idx_tasks_iteration",
        "idx_tasks_loop_definition_id",
        "idx_tasks_spawned_from_task_id",
        "idx_tasks_status",
        "idx_tasks_task_template_id",
        "idx_tasks_workflow_id",
        "idx_workflow_definitions_enabled",
        "idx_workflows_workflow_definition_id",
      ]);
      expect(constraints.rows).toHaveLength(1);
    });
  });

  describe("AgentsRepository", () => {
    it("round-trips inserted agents and keeps timestamps as DB-only metadata", async () => {
      const agent = createAgent("agent-1", {
        capabilities: ["analysis", "review"],
        config: { endpoint: "http://localhost:3000" },
      });

      await agentsRepository.insert(agent);

      const found = await agentsRepository.findById(agent.agentId);

      expect(found).toEqual(agent);
      expect(found).not.toHaveProperty("createdAt");
      expect(found).not.toHaveProperty("updatedAt");

      const raw = await pool.query<AgentRow>(
        `SELECT * FROM agents WHERE agent_id = $1`,
        [agent.agentId],
      );

      expect(raw.rows[0].created_at).toBeDefined();
      expect(raw.rows[0].updated_at).toBeDefined();
    });

    it("upserts agents and updates mutable fields", async () => {
      await agentsRepository.insert(createAgent("agent-1"));

      await agentsRepository.upsert(
        createAgent("agent-1", {
          name: "Updated Agent",
          enabled: false,
          capabilities: ["implementation"],
          config: { retries: 3 },
        }),
      );

      expect(await agentsRepository.findById("agent-1")).toEqual(
        createAgent("agent-1", {
          name: "Updated Agent",
          enabled: false,
          capabilities: ["implementation"],
          config: { retries: 3 },
        }),
      );
    });

    it("returns all agents in created_at ascending order", async () => {
      await agentsRepository.insert(createAgent("agent-1"));
      await agentsRepository.insert(createAgent("agent-2"));
      await pool.query(
        `UPDATE agents SET created_at = $2::timestamptz WHERE agent_id = $1`,
        ["agent-1", "2026-03-15T00:00:02.000Z"],
      );
      await pool.query(
        `UPDATE agents SET created_at = $2::timestamptz WHERE agent_id = $1`,
        ["agent-2", "2026-03-15T00:00:01.000Z"],
      );

      expect(
        (await agentsRepository.findAll()).map((agent) => agent.agentId),
      ).toEqual(["agent-2", "agent-1"]);
    });

    it("returns enabled agents only and keeps created_at ordering", async () => {
      await agentsRepository.insert(createAgent("agent-1", { enabled: false }));
      await agentsRepository.insert(createAgent("agent-2"));
      await agentsRepository.insert(createAgent("agent-3"));
      await pool.query(
        `UPDATE agents SET created_at = $2::timestamptz WHERE agent_id = $1`,
        ["agent-3", "2026-03-15T00:00:00.000Z"],
      );
      await pool.query(
        `UPDATE agents SET created_at = $2::timestamptz WHERE agent_id = $1`,
        ["agent-2", "2026-03-15T00:00:01.000Z"],
      );

      expect(
        (await agentsRepository.findEnabled()).map((agent) => agent.agentId),
      ).toEqual(["agent-3", "agent-2"]);
    });

    it("deletes agents by id and treats missing deletes as a no-op", async () => {
      await agentsRepository.insert(createAgent("agent-1"));

      await agentsRepository.deleteById("agent-1");
      await agentsRepository.deleteById("missing-agent");

      expect(await agentsRepository.findById("agent-1")).toBeNull();
    });
  });

  describe("WorkflowsRepository", () => {
    it("round-trips inserted workflows", async () => {
      const workflow = createWorkflow("workflow-1", {
        status: "running",
        metadata: { initiatedBy: "manual" },
      });

      await workflowsRepository.insert(workflow);

      expect(await workflowsRepository.findById(workflow.workflowId)).toEqual(
        workflow,
      );
    });

    it("upserts workflows and updates status, metadata, and updatedAt", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));

      const updatedWorkflow = createWorkflow("workflow-1", {
        status: "failed",
        metadata: { source: "scheduler" },
        updatedAt: "2026-03-15T01:00:00.000Z",
      });

      await workflowsRepository.upsert(updatedWorkflow);

      expect(await workflowsRepository.findById("workflow-1")).toEqual(
        updatedWorkflow,
      );
    });

    it("round-trips workflow provenance fields", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );

      const workflow = createWorkflow("workflow-1", {
        workflowDefinitionId: "workflow-definition-1",
        triggerSource: "schedule",
        triggeredByScheduleId: "schedule-1",
        startedAt: "2026-03-15T00:01:00.000Z",
      });

      await workflowsRepository.insert(workflow);

      expect(await workflowsRepository.findById("workflow-1")).toEqual(
        workflow,
      );
    });

    it("finds workflows by status and returns created_at ascending order", async () => {
      await workflowsRepository.insert(
        createWorkflow("workflow-1", {
          status: "running",
          createdAt: "2026-03-15T00:00:02.000Z",
          updatedAt: "2026-03-15T00:00:02.000Z",
        }),
      );
      await workflowsRepository.insert(
        createWorkflow("workflow-2", {
          status: "running",
          createdAt: "2026-03-15T00:00:01.000Z",
          updatedAt: "2026-03-15T00:00:01.000Z",
        }),
      );
      await workflowsRepository.insert(createWorkflow("workflow-3"));

      expect(
        (await workflowsRepository.findAll()).map(
          (workflow) => workflow.workflowId,
        ),
      ).toEqual(["workflow-3", "workflow-2", "workflow-1"]);
      expect(
        (await workflowsRepository.findByStatus("running")).map(
          (workflow) => workflow.workflowId,
        ),
      ).toEqual(["workflow-2", "workflow-1"]);
    });

    it("deletes workflows by id", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));

      await workflowsRepository.deleteById("workflow-1");
      await workflowsRepository.deleteById("missing-workflow");

      expect(await workflowsRepository.findById("workflow-1")).toBeNull();
    });
  });

  describe("WorkflowDefinitionsRepository", () => {
    it("round-trips inserted workflow definitions", async () => {
      const workflowDefinition = createWorkflowDefinition(
        "workflow-definition-1",
        {
          description: "Reusable workflow definition",
          metadata: { team: "platform" },
        },
      );

      await workflowDefinitionsRepository.upsert(workflowDefinition);

      expect(
        await workflowDefinitionsRepository.findById(
          workflowDefinition.workflowDefinitionId,
        ),
      ).toEqual(workflowDefinition);
    });

    it("finds enabled definitions and keeps created_at ascending order", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1", {
          enabled: false,
          createdAt: "2026-03-15T00:00:02.000Z",
          updatedAt: "2026-03-15T00:00:02.000Z",
        }),
      );
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-2", {
          createdAt: "2026-03-15T00:00:01.000Z",
          updatedAt: "2026-03-15T00:00:01.000Z",
        }),
      );
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-3", {
          createdAt: "2026-03-15T00:00:00.000Z",
          updatedAt: "2026-03-15T00:00:00.000Z",
        }),
      );

      expect(
        (await workflowDefinitionsRepository.findAll()).map(
          (workflowDefinition) => workflowDefinition.workflowDefinitionId,
        ),
      ).toEqual([
        "workflow-definition-3",
        "workflow-definition-2",
        "workflow-definition-1",
      ]);
      expect(
        (await workflowDefinitionsRepository.findEnabled()).map(
          (workflowDefinition) => workflowDefinition.workflowDefinitionId,
        ),
      ).toEqual(["workflow-definition-3", "workflow-definition-2"]);
    });

    it("deletes workflow definitions by id", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );

      await workflowDefinitionsRepository.deleteById("workflow-definition-1");
      await workflowDefinitionsRepository.deleteById("missing-definition");

      expect(
        await workflowDefinitionsRepository.findById("workflow-definition-1"),
      ).toBeNull();
    });
  });

  describe("LoopDefinitionsRepository", () => {
    it("round-trips inserted loop definitions", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-dev", "workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-review", "workflow-definition-1"),
      );

      const loopDefinition = createLoopDefinition("workflow-definition-1");

      await loopDefinitionsRepository.upsert(loopDefinition);

      expect(
        await loopDefinitionsRepository.findById(
          loopDefinition.loopDefinitionId,
        ),
      ).toEqual(loopDefinition);
      expect(
        await loopDefinitionsRepository.findByWorkflowDefinitionId(
          "workflow-definition-1",
        ),
      ).toEqual(loopDefinition);
    });

    it("deletes loop definitions by id", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-dev", "workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-review", "workflow-definition-1"),
      );
      await loopDefinitionsRepository.upsert(
        createLoopDefinition("workflow-definition-1"),
      );

      await loopDefinitionsRepository.deleteById("loop-workflow-definition-1");
      await loopDefinitionsRepository.deleteById("missing-loop");

      expect(
        await loopDefinitionsRepository.findById("loop-workflow-definition-1"),
      ).toBeNull();
    });
  });

  describe("TasksRepository", () => {
    it("round-trips inserted tasks", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await agentsRepository.insert(createAgent("agent-1"));

      const task = createTask("task-1", "workflow-1", {
        payload: { input: "value" },
        status: "ready",
        assigneeAgentId: "agent-1",
        retryCount: 2,
        concurrencyKey: "repo:regisseur",
        metadata: { requiredCapabilities: ["review"] },
      });

      await tasksRepository.insert(task);

      expect(await tasksRepository.findById(task.taskId)).toEqual(task);
    });

    it("upserts tasks and updates mutable fields", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await agentsRepository.insert(createAgent("agent-1"));
      await agentsRepository.insert(createAgent("agent-2"));
      await tasksRepository.insert(createTask("task-1", "workflow-1"));

      const updatedTask = createTask("task-1", "workflow-1", {
        status: "running",
        assigneeAgentId: "agent-2",
        retryCount: 3,
        metadata: { priority: "high" },
        updatedAt: "2026-03-15T01:00:00.000Z",
      });

      await tasksRepository.upsert(updatedTask);

      expect(await tasksRepository.findById("task-1")).toEqual(updatedTask);
    });

    it("round-trips task template provenance fields", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await workflowsRepository.insert(
        createWorkflow("workflow-1", {
          workflowDefinitionId: "workflow-definition-1",
          triggerSource: "manual",
        }),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-1", "workflow-definition-1"),
      );

      const task = createTask("task-1", "workflow-1", {
        taskTemplateId: "task-template-1",
      });

      await tasksRepository.insert(task);

      expect(await tasksRepository.findById("task-1")).toEqual(task);
    });

    it("round-trips loop provenance fields", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-dev", "workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-review", "workflow-definition-1"),
      );
      await loopDefinitionsRepository.upsert(
        createLoopDefinition("workflow-definition-1"),
      );
      await workflowsRepository.insert(
        createWorkflow("workflow-1", {
          workflowDefinitionId: "workflow-definition-1",
          triggerSource: "manual",
        }),
      );
      await tasksRepository.insert(
        createTask("task-source", "workflow-1", {
          taskTemplateId: "task-template-review",
        }),
      );

      const task = createTask("task-1", "workflow-1", {
        taskTemplateId: "task-template-dev",
        loopDefinitionId: "loop-workflow-definition-1",
        iteration: 2,
        spawnedFromTaskId: "task-source",
      });

      await tasksRepository.insert(task);

      expect(await tasksRepository.findById("task-1")).toEqual(task);
    });

    it("finds tasks by workflow, status, and ready state in created_at ascending order", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await workflowsRepository.insert(createWorkflow("workflow-2"));

      await tasksRepository.insert(
        createTask("task-1", "workflow-1", {
          status: "ready",
          createdAt: "2026-03-15T00:00:02.000Z",
          updatedAt: "2026-03-15T00:00:02.000Z",
        }),
      );
      await tasksRepository.insert(
        createTask("task-2", "workflow-1", {
          status: "ready",
          createdAt: "2026-03-15T00:00:01.000Z",
          updatedAt: "2026-03-15T00:00:01.000Z",
        }),
      );
      await tasksRepository.insert(
        createTask("task-3", "workflow-2", {
          status: "blocked",
        }),
      );

      expect(
        (await tasksRepository.findByWorkflowId("workflow-1")).map(
          (task) => task.taskId,
        ),
      ).toEqual(["task-2", "task-1"]);
      expect(
        (await tasksRepository.findByStatus("ready")).map(
          (task) => task.taskId,
        ),
      ).toEqual(["task-2", "task-1"]);
      expect(
        (await tasksRepository.findReadyTasks()).map((task) => task.taskId),
      ).toEqual(["task-2", "task-1"]);
    });

    it("round-trips nullable task fields safely", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));

      const task = createTask("task-1", "workflow-1");

      await tasksRepository.insert(task);

      expect(await tasksRepository.findById("task-1")).toEqual(task);
    });

    it("fails when inserting a task with a missing workflow or assignee agent", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));

      await expect(
        tasksRepository.insert(
          createTask("task-missing-workflow", "missing-workflow"),
        ),
      ).rejects.toThrow();

      await expect(
        tasksRepository.insert(
          createTask("task-missing-agent", "workflow-1", {
            assigneeAgentId: "missing-agent",
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("TaskEdgesRepository", () => {
    async function seedTasks(): Promise<void> {
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await tasksRepository.insert(createTask("task-a", "workflow-1"));
      await tasksRepository.insert(createTask("task-b", "workflow-1"));
      await tasksRepository.insert(createTask("task-c", "workflow-1"));
    }

    it("inserts and finds edges by from_task_id and to_task_id", async () => {
      await seedTasks();

      const edge = createTaskEdge("task-a", "task-b");

      await taskEdgesRepository.insert(edge);

      expect(await taskEdgesRepository.findByFromTaskId("task-a")).toEqual([
        edge,
      ]);
      expect(await taskEdgesRepository.findByToTaskId("task-b")).toEqual([
        edge,
      ]);
    });

    it("inserts multiple edges and rejects duplicates", async () => {
      await seedTasks();

      await taskEdgesRepository.insertMany([
        createTaskEdge("task-a", "task-b"),
        createTaskEdge("task-b", "task-c"),
      ]);

      await expect(
        taskEdgesRepository.insert(createTaskEdge("task-a", "task-b")),
      ).rejects.toThrow();
      expect(await taskEdgesRepository.findByFromTaskId("task-b")).toEqual([
        createTaskEdge("task-b", "task-c"),
      ]);
    });

    it("fails when edges reference missing tasks", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await tasksRepository.insert(createTask("task-a", "workflow-1"));

      await expect(
        taskEdgesRepository.insert(createTaskEdge("task-a", "missing-task")),
      ).rejects.toThrow();
    });

    it("deleteByTaskId removes edges where the task appears on either side", async () => {
      await seedTasks();
      await taskEdgesRepository.insertMany([
        createTaskEdge("task-a", "task-b"),
        createTaskEdge("task-b", "task-c"),
        createTaskEdge("task-c", "task-a"),
      ]);

      await taskEdgesRepository.deleteByTaskId("task-b");

      expect(await taskEdgesRepository.findByFromTaskId("task-a")).toEqual([]);
      expect(await taskEdgesRepository.findByToTaskId("task-c")).toEqual([]);
    });

    it("deleteEdge removes only the exact edge", async () => {
      await seedTasks();
      await taskEdgesRepository.insertMany([
        createTaskEdge("task-a", "task-b"),
        createTaskEdge("task-b", "task-c"),
      ]);

      await taskEdgesRepository.deleteEdge("task-a", "task-b");

      expect(await taskEdgesRepository.findByFromTaskId("task-a")).toEqual([]);
      expect(await taskEdgesRepository.findByFromTaskId("task-b")).toEqual([
        createTaskEdge("task-b", "task-c"),
      ]);
    });

    it("findAllByWorkflowTasks returns only edges fully inside the supplied task set", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await workflowsRepository.insert(createWorkflow("workflow-2"));
      await tasksRepository.insert(createTask("task-a", "workflow-1"));
      await tasksRepository.insert(createTask("task-b", "workflow-1"));
      await tasksRepository.insert(createTask("task-x", "workflow-2"));
      await taskEdgesRepository.insertMany([
        createTaskEdge("task-a", "task-b"),
        createTaskEdge("task-a", "task-x"),
        createTaskEdge("task-x", "task-b"),
      ]);

      expect(
        await taskEdgesRepository.findAllByWorkflowTasks(["task-a", "task-b"]),
      ).toEqual([createTaskEdge("task-a", "task-b")]);
    });
  });

  describe("TaskTemplatesRepository", () => {
    it("round-trips inserted task templates including nullable assignee", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await agentsRepository.insert(createAgent("agent-1"));

      const taskTemplate = createTaskTemplate(
        "task-template-1",
        "workflow-definition-1",
        {
          defaultAssigneeAgentId: "agent-1",
          retryCount: 2,
          concurrencyKey: "repo:regisseur",
          metadata: { role: "review" },
        },
      );

      await taskTemplatesRepository.upsert(taskTemplate);

      expect(
        await taskTemplatesRepository.findById(taskTemplate.taskTemplateId),
      ).toEqual(taskTemplate);
    });

    it("finds task templates by workflow definition in created_at ascending order", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-2"),
      );

      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-1", "workflow-definition-1", {
          createdAt: "2026-03-15T00:00:02.000Z",
          updatedAt: "2026-03-15T00:00:02.000Z",
        }),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-2", "workflow-definition-1", {
          createdAt: "2026-03-15T00:00:01.000Z",
          updatedAt: "2026-03-15T00:00:01.000Z",
        }),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-3", "workflow-definition-2"),
      );

      expect(
        (
          await taskTemplatesRepository.findByWorkflowDefinitionId(
            "workflow-definition-1",
          )
        ).map((taskTemplate) => taskTemplate.taskTemplateId),
      ).toEqual(["task-template-2", "task-template-1"]);
    });

    it("does not move a task template to a different workflow definition on upsert", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-2"),
      );

      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-1", "workflow-definition-1", {
          title: "Original title",
        }),
      );

      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-1", "workflow-definition-2", {
          title: "Updated title",
          retryCount: 3,
          updatedAt: "2026-03-15T01:00:00.000Z",
        }),
      );

      expect(await taskTemplatesRepository.findById("task-template-1")).toEqual(
        createTaskTemplate("task-template-1", "workflow-definition-1", {
          title: "Updated title",
          retryCount: 3,
          updatedAt: "2026-03-15T01:00:00.000Z",
        }),
      );
      expect(
        (
          await taskTemplatesRepository.findByWorkflowDefinitionId(
            "workflow-definition-1",
          )
        ).map((taskTemplate) => taskTemplate.taskTemplateId),
      ).toEqual(["task-template-1"]);
      expect(
        await taskTemplatesRepository.findByWorkflowDefinitionId(
          "workflow-definition-2",
        ),
      ).toEqual([]);
    });

    it("fails when task templates reference missing workflow definitions or agents", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );

      await expect(
        taskTemplatesRepository.upsert(
          createTaskTemplate(
            "task-template-missing-definition",
            "missing-definition",
          ),
        ),
      ).rejects.toThrow();

      await expect(
        taskTemplatesRepository.upsert(
          createTaskTemplate(
            "task-template-missing-agent",
            "workflow-definition-1",
            {
              defaultAssigneeAgentId: "missing-agent",
            },
          ),
        ),
      ).rejects.toThrow();
    });
  });

  describe("TaskTemplateEdgesRepository", () => {
    async function seedTaskTemplates(): Promise<void> {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-a", "workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-b", "workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-c", "workflow-definition-1"),
      );
    }

    it("inserts and finds task template edges", async () => {
      await seedTaskTemplates();

      const edge = createTaskTemplateEdge("task-template-a", "task-template-b");

      await taskTemplateEdgesRepository.insert(edge);

      expect(
        await taskTemplateEdgesRepository.findByFromTaskTemplateId(
          "task-template-a",
        ),
      ).toEqual([edge]);
      expect(
        await taskTemplateEdgesRepository.findByToTaskTemplateId(
          "task-template-b",
        ),
      ).toEqual([edge]);
    });

    it("inserts multiple task template edges and rejects duplicates", async () => {
      await seedTaskTemplates();

      await taskTemplateEdgesRepository.insertMany([
        createTaskTemplateEdge("task-template-a", "task-template-b"),
        createTaskTemplateEdge("task-template-b", "task-template-c"),
      ]);

      await expect(
        taskTemplateEdgesRepository.insert(
          createTaskTemplateEdge("task-template-a", "task-template-b"),
        ),
      ).rejects.toThrow();
    });

    it("deleteEdge removes only the exact task template edge", async () => {
      await seedTaskTemplates();
      await taskTemplateEdgesRepository.insertMany([
        createTaskTemplateEdge("task-template-a", "task-template-b"),
        createTaskTemplateEdge("task-template-b", "task-template-c"),
      ]);

      await taskTemplateEdgesRepository.deleteEdge(
        "task-template-a",
        "task-template-b",
      );

      expect(
        await taskTemplateEdgesRepository.findByFromTaskTemplateId(
          "task-template-a",
        ),
      ).toEqual([]);
      expect(
        await taskTemplateEdgesRepository.findByFromTaskTemplateId(
          "task-template-b",
        ),
      ).toEqual([createTaskTemplateEdge("task-template-b", "task-template-c")]);
    });
  });

  describe("SchedulesRepository", () => {
    it("round-trips once and cron schedules", async () => {
      const onceSchedule = createSchedule("schedule-once");
      const cronSchedule = createSchedule("schedule-cron", {
        type: "cron",
        runAt: undefined,
        cronExpression: "0 9 * * *",
        timezone: "Asia/Seoul",
        targetType: "task",
        targetId: "task-1",
      });

      await schedulesRepository.insert(onceSchedule);
      await schedulesRepository.insert(cronSchedule);

      expect(await schedulesRepository.findById("schedule-once")).toEqual(
        onceSchedule,
      );
      expect(await schedulesRepository.findById("schedule-cron")).toEqual(
        cronSchedule,
      );
    });

    it("upserts schedules and updates enabled, timezone, and targetId", async () => {
      await schedulesRepository.insert(createSchedule("schedule-1"));

      const updated = createSchedule("schedule-1", {
        enabled: false,
        timezone: "UTC",
        targetId: "workflow-2",
        updatedAt: "2026-03-15T01:00:00.000Z",
      });

      await schedulesRepository.upsert(updated);

      expect(await schedulesRepository.findById("schedule-1")).toEqual(updated);
    });

    it("finds all schedules in created_at ascending order", async () => {
      await schedulesRepository.insert(
        createSchedule("schedule-1", {
          createdAt: "2026-03-15T00:00:02.000Z",
          updatedAt: "2026-03-15T00:00:02.000Z",
        }),
      );
      await schedulesRepository.insert(
        createSchedule("schedule-2", {
          createdAt: "2026-03-15T00:00:01.000Z",
          updatedAt: "2026-03-15T00:00:01.000Z",
        }),
      );
      await schedulesRepository.insert(createSchedule("schedule-3"));

      expect(
        (await schedulesRepository.findAll()).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-3", "schedule-2", "schedule-1"]);
    });

    it("finds enabled schedules in created_at ascending order", async () => {
      await schedulesRepository.insert(
        createSchedule("schedule-1", {
          targetId: "workflow-1",
          createdAt: "2026-03-15T00:00:02.000Z",
          updatedAt: "2026-03-15T00:00:02.000Z",
        }),
      );
      await schedulesRepository.insert(
        createSchedule("schedule-2", {
          targetId: "workflow-1",
          createdAt: "2026-03-15T00:00:01.000Z",
          updatedAt: "2026-03-15T00:00:01.000Z",
        }),
      );
      await schedulesRepository.insert(
        createSchedule("schedule-3", {
          enabled: false,
          targetId: "workflow-2",
        }),
      );

      expect(
        (await schedulesRepository.findEnabled()).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-2", "schedule-1"]);
    });

    it("finds target matches in created_at ascending order regardless of enabled state", async () => {
      await schedulesRepository.insert(
        createSchedule("schedule-1", {
          targetId: "workflow-1",
          createdAt: "2026-03-15T00:00:02.000Z",
          updatedAt: "2026-03-15T00:00:02.000Z",
        }),
      );
      await schedulesRepository.insert(
        createSchedule("schedule-2", {
          targetId: "workflow-1",
          createdAt: "2026-03-15T00:00:01.000Z",
          updatedAt: "2026-03-15T00:00:01.000Z",
        }),
      );
      await schedulesRepository.insert(
        createSchedule("schedule-3", {
          enabled: false,
          targetId: "workflow-1",
        }),
      );
      await schedulesRepository.insert(
        createSchedule("schedule-4", {
          targetId: "workflow-2",
        }),
      );

      expect(
        (await schedulesRepository.findByTarget("workflow", "workflow-1")).map(
          (schedule) => schedule.scheduleId,
        ),
      ).toEqual(["schedule-3", "schedule-2", "schedule-1"]);
    });

    it("rejects invalid once and cron schedules", async () => {
      await expect(
        schedulesRepository.insert(
          createSchedule("invalid-once", {
            runAt: undefined,
          }),
        ),
      ).rejects.toThrow("requires runAt");

      await expect(
        schedulesRepository.insert(
          createSchedule("invalid-cron", {
            type: "cron",
            runAt: undefined,
            cronExpression: undefined,
          }),
        ),
      ).rejects.toThrow("requires cronExpression");
    });

    it("allows polymorphic target ids without a database foreign key", async () => {
      const schedule = createSchedule("schedule-1", {
        targetType: "task",
        targetId: "missing-task-id",
      });

      await schedulesRepository.insert(schedule);

      expect(await schedulesRepository.findById("schedule-1")).toEqual(
        schedule,
      );
    });
  });

  describe("RunsRepository", () => {
    async function seedRunDependencies(): Promise<void> {
      await agentsRepository.insert(createAgent("agent-1"));
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await tasksRepository.insert(createTask("task-1", "workflow-1"));
      await tasksRepository.insert(createTask("task-2", "workflow-1"));
    }

    it("round-trips inserted runs", async () => {
      await seedRunDependencies();

      const run = createRun("run-1", "task-1", "agent-1", {
        status: "running",
        startedAt: "2026-03-15T00:05:00.000Z",
        output: { step: "started" },
      });

      await runsRepository.insert(run);

      expect(await runsRepository.findById(run.runId)).toEqual(run);
    });

    it("upserts runs and updates status, output, error, and finishedAt", async () => {
      await seedRunDependencies();
      await runsRepository.insert(createRun("run-1", "task-1", "agent-1"));

      const updated = createRun("run-1", "task-1", "agent-1", {
        status: "failed",
        output: { message: "failed" },
        error: "boom",
        finishedAt: "2026-03-15T00:10:00.000Z",
        updatedAt: "2026-03-15T00:10:00.000Z",
      });

      await runsRepository.upsert(updated);

      expect(await runsRepository.findById("run-1")).toEqual(updated);
    });

    it("finds runs by task, agent, and status in created_at ascending order", async () => {
      await seedRunDependencies();
      await runsRepository.insert(
        createRun("run-1", "task-1", "agent-1", {
          status: "queued",
          createdAt: "2026-03-15T00:00:02.000Z",
          updatedAt: "2026-03-15T00:00:02.000Z",
        }),
      );
      await runsRepository.insert(
        createRun("run-2", "task-1", "agent-1", {
          status: "queued",
          createdAt: "2026-03-15T00:00:01.000Z",
          updatedAt: "2026-03-15T00:00:01.000Z",
        }),
      );
      await runsRepository.insert(
        createRun("run-3", "task-2", "agent-1", {
          status: "running",
        }),
      );

      expect(
        (await runsRepository.findByTaskId("task-1")).map((run) => run.runId),
      ).toEqual(["run-2", "run-1"]);
      expect(
        (await runsRepository.findByAgentId("agent-1")).map((run) => run.runId),
      ).toEqual(["run-3", "run-2", "run-1"]);
      expect(
        (await runsRepository.findByStatus("queued")).map((run) => run.runId),
      ).toEqual(["run-2", "run-1"]);
    });

    it("round-trips nullable output and error fields safely", async () => {
      await seedRunDependencies();

      const run = createRun("run-1", "task-1", "agent-1", {
        error: "failed",
      });

      await runsRepository.insert(run);

      expect(await runsRepository.findById("run-1")).toEqual(run);
    });

    it("fails when runs reference missing tasks or agents", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await agentsRepository.insert(createAgent("agent-1"));
      await tasksRepository.insert(createTask("task-1", "workflow-1"));

      await expect(
        runsRepository.insert(
          createRun("run-missing-task", "missing-task", "agent-1"),
        ),
      ).rejects.toThrow();

      await expect(
        runsRepository.insert(
          createRun("run-missing-agent", "task-1", "missing-agent"),
        ),
      ).rejects.toThrow();
    });
  });

  describe("mappers", () => {
    it("restores JSONB fields back into the domain shape", () => {
      const agent = mapAgentRowToDomain({
        agent_id: "agent-1",
        name: "Agent",
        runtime_type: "cli",
        capabilities: ["review"],
        enabled: true,
        config: { endpoint: "http://localhost" },
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies AgentRow);
      const task = mapTaskRowToDomain({
        task_id: "task-1",
        workflow_id: "workflow-1",
        title: "Task",
        payload: { input: "value" },
        status: "ready",
        assignee_agent_id: null,
        retry_count: 0,
        task_template_id: "task-template-1",
        loop_definition_id: "loop-1",
        iteration: 2,
        spawned_from_task_id: "task-parent-1",
        concurrency_key: null,
        metadata: { priority: "high" },
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies TaskRow);
      const run = mapRunRowToDomain({
        run_id: "run-1",
        task_id: "task-1",
        agent_id: "agent-1",
        status: "queued",
        started_at: null,
        finished_at: null,
        output: { value: "ok" },
        error: null,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies RunRow);

      expect(agent.capabilities).toEqual(["review"]);
      expect(agent.config).toEqual({ endpoint: "http://localhost" });
      expect(task.payload).toEqual({ input: "value" });
      expect(task.taskTemplateId).toBe("task-template-1");
      expect(task.loopDefinitionId).toBe("loop-1");
      expect(task.iteration).toBe(2);
      expect(task.spawnedFromTaskId).toBe("task-parent-1");
      expect(task.metadata).toEqual({ priority: "high" });
      expect(run.output).toEqual({ value: "ok" });
    });

    it("restores definition mapper rows back into the domain shape", () => {
      const workflowDefinition = mapWorkflowDefinitionRowToDomain({
        workflow_definition_id: "workflow-definition-1",
        name: "Definition",
        description: "Reusable workflow",
        enabled: true,
        metadata: { team: "platform" },
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies WorkflowDefinitionRow);
      const taskTemplate = mapTaskTemplateRowToDomain({
        task_template_id: "task-template-1",
        workflow_definition_id: "workflow-definition-1",
        title: "Template",
        payload: { input: "value" },
        default_assignee_agent_id: null,
        retry_count: 1,
        concurrency_key: "repo:regisseur",
        metadata: { priority: "high" },
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies TaskTemplateRow);
      const loopDefinition = mapLoopDefinitionRowToDomain({
        loop_definition_id: "loop-1",
        workflow_definition_id: "workflow-definition-1",
        name: "Review loop",
        controller_task_template_id: "task-template-review",
        entry_task_template_ids: ["task-template-dev"],
        body_task_template_ids: ["task-template-dev", "task-template-review"],
        max_iterations: 4,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies LoopDefinitionRow);

      expect(workflowDefinition.metadata).toEqual({ team: "platform" });
      expect(taskTemplate.payload).toEqual({ input: "value" });
      expect(taskTemplate.metadata).toEqual({ priority: "high" });
      expect(loopDefinition.entryTaskTemplateIds).toEqual([
        "task-template-dev",
      ]);
      expect(loopDefinition.bodyTaskTemplateIds).toEqual([
        "task-template-dev",
        "task-template-review",
      ]);
      expect(loopDefinition.maxIterations).toBe(4);
    });

    it("restores timestamps as ISO strings", () => {
      const workflow = mapWorkflowRowToDomain({
        workflow_id: "workflow-1",
        name: "Workflow",
        status: "running",
        workflow_definition_id: "workflow-definition-1",
        trigger_source: "manual",
        triggered_by_schedule_id: "schedule-1",
        started_at: new Date("2026-03-15T00:01:00.000Z"),
        metadata: null,
        created_at: new Date("2026-03-15T00:00:00.000Z"),
        updated_at: new Date("2026-03-15T01:00:00.000Z"),
      } satisfies WorkflowRow);
      const schedule = mapScheduleRowToDomain({
        schedule_id: "schedule-1",
        type: "once",
        cron_expression: null,
        run_at: "2026-03-15T02:00:00.000Z",
        timezone: null,
        enabled: true,
        target_type: "workflow",
        target_id: "workflow-1",
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies ScheduleRow);
      const run = mapRunRowToDomain({
        run_id: "run-1",
        task_id: "task-1",
        agent_id: "agent-1",
        status: "running",
        started_at: new Date("2026-03-15T00:10:00.000Z"),
        finished_at: new Date("2026-03-15T00:11:00.000Z"),
        output: null,
        error: null,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:11:00.000Z",
      } satisfies RunRow);

      expect(workflow.createdAt).toBe("2026-03-15T00:00:00.000Z");
      expect(workflow.updatedAt).toBe("2026-03-15T01:00:00.000Z");
      expect(workflow.workflowDefinitionId).toBe("workflow-definition-1");
      expect(workflow.triggerSource).toBe("manual");
      expect(workflow.triggeredByScheduleId).toBe("schedule-1");
      expect(workflow.startedAt).toBe("2026-03-15T00:01:00.000Z");
      expect(schedule.runAt).toBe("2026-03-15T02:00:00.000Z");
      expect(run.startedAt).toBe("2026-03-15T00:10:00.000Z");
      expect(run.finishedAt).toBe("2026-03-15T00:11:00.000Z");
    });

    it("handles nullable timestamp, JSON, and text fields safely", () => {
      const task = mapTaskRowToDomain({
        task_id: "task-1",
        workflow_id: "workflow-1",
        title: "Task",
        payload: {},
        status: "pending",
        assignee_agent_id: null,
        retry_count: 0,
        task_template_id: null,
        loop_definition_id: null,
        iteration: null,
        spawned_from_task_id: null,
        concurrency_key: null,
        metadata: null,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies TaskRow);
      const run = mapRunRowToDomain({
        run_id: "run-1",
        task_id: "task-1",
        agent_id: "agent-1",
        status: "queued",
        started_at: null,
        finished_at: null,
        output: null,
        error: null,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies RunRow);

      expect(task).not.toHaveProperty("metadata");
      expect(task).not.toHaveProperty("assigneeAgentId");
      expect(run).not.toHaveProperty("startedAt");
      expect(run).not.toHaveProperty("finishedAt");
      expect(run).not.toHaveProperty("output");
      expect(run).not.toHaveProperty("error");
    });

    it("keeps agent timestamps out of the domain outward shape", () => {
      const agent = mapAgentRowToDomain({
        agent_id: "agent-1",
        name: "Agent",
        runtime_type: "cli",
        capabilities: [],
        enabled: true,
        config: {},
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      } satisfies AgentRow);

      expect(agent).not.toHaveProperty("createdAt");
      expect(agent).not.toHaveProperty("updatedAt");
    });
  });

  describe("delete and integrity corner cases", () => {
    it("fails to delete a workflow while tasks still reference it", async () => {
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await tasksRepository.insert(createTask("task-1", "workflow-1"));

      await expect(
        workflowsRepository.deleteById("workflow-1"),
      ).rejects.toThrow();
    });

    it("fails to delete a task while edges or runs still reference it", async () => {
      await agentsRepository.insert(createAgent("agent-1"));
      await workflowsRepository.insert(createWorkflow("workflow-1"));
      await tasksRepository.insert(createTask("task-1", "workflow-1"));
      await tasksRepository.insert(createTask("task-2", "workflow-1"));
      await taskEdgesRepository.insert(createTaskEdge("task-1", "task-2"));
      await runsRepository.insert(createRun("run-1", "task-1", "agent-1"));

      await expect(tasksRepository.deleteById("task-1")).rejects.toThrow();
    });

    it("fails to delete a workflow definition while task templates still reference it", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-1", "workflow-definition-1"),
      );

      await expect(
        workflowDefinitionsRepository.deleteById("workflow-definition-1"),
      ).rejects.toThrow();
    });

    it("fails to delete a loop definition while tasks still reference it", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-dev", "workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-review", "workflow-definition-1"),
      );
      await loopDefinitionsRepository.upsert(
        createLoopDefinition("workflow-definition-1"),
      );
      await workflowsRepository.insert(
        createWorkflow("workflow-1", {
          workflowDefinitionId: "workflow-definition-1",
        }),
      );
      await tasksRepository.insert(
        createTask("task-1", "workflow-1", {
          taskTemplateId: "task-template-dev",
          loopDefinitionId: "loop-workflow-definition-1",
        }),
      );

      await expect(
        loopDefinitionsRepository.deleteById("loop-workflow-definition-1"),
      ).rejects.toThrow();
    });

    it("fails to delete a task template while template edges still reference it", async () => {
      await workflowDefinitionsRepository.upsert(
        createWorkflowDefinition("workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-1", "workflow-definition-1"),
      );
      await taskTemplatesRepository.upsert(
        createTaskTemplate("task-template-2", "workflow-definition-1"),
      );
      await taskTemplateEdgesRepository.insert(
        createTaskTemplateEdge("task-template-1", "task-template-2"),
      );

      await expect(
        taskTemplatesRepository.deleteById("task-template-1"),
      ).rejects.toThrow();
    });

    it("treats deleteById of missing rows as a no-op across repositories", async () => {
      await expect(
        agentsRepository.deleteById("missing"),
      ).resolves.toBeUndefined();
      await expect(
        workflowsRepository.deleteById("missing"),
      ).resolves.toBeUndefined();
      await expect(
        tasksRepository.deleteById("missing"),
      ).resolves.toBeUndefined();
      await expect(
        schedulesRepository.deleteById("missing"),
      ).resolves.toBeUndefined();
      await expect(
        workflowDefinitionsRepository.deleteById("missing"),
      ).resolves.toBeUndefined();
      await expect(
        loopDefinitionsRepository.deleteById("missing"),
      ).resolves.toBeUndefined();
      await expect(
        taskTemplatesRepository.deleteById("missing"),
      ).resolves.toBeUndefined();
      await expect(
        runsRepository.deleteById("missing"),
      ).resolves.toBeUndefined();
      await expect(
        taskEdgesRepository.deleteByTaskId("missing"),
      ).resolves.toBeUndefined();
      await expect(
        taskTemplateEdgesRepository.deleteByTaskTemplateId("missing"),
      ).resolves.toBeUndefined();
    });
  });
});
