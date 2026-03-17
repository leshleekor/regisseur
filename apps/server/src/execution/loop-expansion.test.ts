import { describe, expect, it, vi } from "vitest";
import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  Task,
  TaskEdge,
  TaskTemplate,
  TaskTemplateEdge,
  Workflow,
} from "@regisseur/core";

import { executeTaskLifecycle } from "./execution-service.js";
import { progressDownstreamTasks } from "./graph-progression.js";
import { expandLoopIteration } from "./loop-expansion.js";

function createAgent(agentId: string): AgentDefinition {
  return {
    agentId,
    name: agentId,
    runtimeType: "cli",
    capabilities: [],
    enabled: true,
    config: {},
  };
}

function createWorkflow(
  workflowId: string,
  overrides: Partial<Workflow> = {},
): Workflow {
  return {
    workflowId,
    name: workflowId,
    status: "running",
    workflowDefinitionId: "workflow-definition-1",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
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
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
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
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
    ...overrides,
  };
}

function createTaskEdge(fromTaskId: string, toTaskId: string): TaskEdge {
  return {
    fromTaskId,
    toTaskId,
    type: "depends_on",
  };
}

function createTaskTemplateEdge(
  fromTaskTemplateId: string,
  toTaskTemplateId: string,
): TaskTemplateEdge {
  return {
    fromTaskTemplateId,
    toTaskTemplateId,
    type: "depends_on",
  };
}

function createLoopDefinition(
  workflowDefinitionId: string,
  overrides: Partial<LoopDefinition> = {},
): LoopDefinition {
  return {
    loopDefinitionId: "loop-1",
    workflowDefinitionId,
    name: "Review Loop",
    controllerTaskTemplateId: "review-template",
    entryTaskTemplateIds: ["dev-template"],
    bodyTaskTemplateIds: ["dev-template", "review-template"],
    maxIterations: 3,
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
    ...overrides,
  };
}

function createRepositories(options: {
  workflow: Workflow;
  tasks: readonly Task[];
  taskEdges: readonly TaskEdge[];
  taskTemplates: readonly TaskTemplate[];
  taskTemplateEdges: readonly TaskTemplateEdge[];
  loopDefinition: LoopDefinition;
  agent: AgentDefinition;
}) {
  const workflows = new Map([[options.workflow.workflowId, options.workflow]]);
  const tasks = new Map(options.tasks.map((task) => [task.taskId, task]));
  const taskEdges = [...options.taskEdges];
  const taskTemplates = new Map(
    options.taskTemplates.map((taskTemplate) => [
      taskTemplate.taskTemplateId,
      taskTemplate,
    ]),
  );
  const taskTemplateEdges = [...options.taskTemplateEdges];
  const loopDefinitions = new Map([
    [options.loopDefinition.loopDefinitionId, options.loopDefinition],
  ]);
  const agents = new Map([[options.agent.agentId, options.agent]]);
  const runs = new Map<string, Run>();

  return {
    state: {
      workflows,
      tasks,
      taskEdges,
      taskTemplates,
      taskTemplateEdges,
      loopDefinitions,
      agents,
      runs,
    },
    repositories: {
      agentsRepository: {
        upsert: vi.fn(async () => undefined),
        findAll: vi.fn(async () => Array.from(agents.values())),
        findEnabled: vi.fn(async () => Array.from(agents.values())),
        findById: vi.fn(async (agentId: string) => agents.get(agentId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      runsRepository: {
        upsert: vi.fn(async (run: Run) => {
          runs.set(run.runId, run);
        }),
        findByTaskId: vi.fn(async () => Array.from(runs.values())),
        findByAgentId: vi.fn(async () => Array.from(runs.values())),
        findByStatus: vi.fn(async () => [] as Run[]),
        findById: vi.fn(async (runId: string) => runs.get(runId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      workflowsRepository: {
        upsert: vi.fn(async (workflow: Workflow) => {
          workflows.set(workflow.workflowId, workflow);
        }),
        findAll: vi.fn(async () => Array.from(workflows.values())),
        findByStatus: vi.fn(async () => [] as Workflow[]),
        findById: vi.fn(
          async (workflowId: string) => workflows.get(workflowId) ?? null,
        ),
        deleteById: vi.fn(async () => undefined),
      },
      tasksRepository: {
        upsert: vi.fn(async (task: Task) => {
          tasks.set(task.taskId, task);
        }),
        findByWorkflowId: vi.fn(async (workflowId: string) =>
          Array.from(tasks.values()).filter(
            (task) => task.workflowId === workflowId,
          ),
        ),
        findByStatus: vi.fn(async () => [] as Task[]),
        findById: vi.fn(async (taskId: string) => tasks.get(taskId) ?? null),
        deleteById: vi.fn(async () => undefined),
      },
      taskEdgesRepository: {
        insert: vi.fn(async (edge: TaskEdge) => {
          taskEdges.push(edge);
        }),
        insertMany: vi.fn(async (edges: readonly TaskEdge[]) => {
          taskEdges.push(...edges);
        }),
        findAllByWorkflowTasks: vi.fn(async (taskIds: readonly string[]) => {
          const taskIdSet = new Set(taskIds);

          return taskEdges.filter(
            (edge) =>
              taskIdSet.has(edge.fromTaskId) && taskIdSet.has(edge.toTaskId),
          );
        }),
        findByFromTaskId: vi.fn(async (taskId: string) =>
          taskEdges.filter((edge) => edge.fromTaskId === taskId),
        ),
        findByToTaskId: vi.fn(async (taskId: string) =>
          taskEdges.filter((edge) => edge.toTaskId === taskId),
        ),
        deleteByTaskId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
      },
      loopDefinitionsRepository: {
        upsert: vi.fn(async (loopDefinition: LoopDefinition) => {
          loopDefinitions.set(loopDefinition.loopDefinitionId, loopDefinition);
        }),
        findByWorkflowDefinitionId: vi.fn(
          async (workflowDefinitionId: string) =>
            Array.from(loopDefinitions.values()).find(
              (loopDefinition) =>
                loopDefinition.workflowDefinitionId === workflowDefinitionId,
            ) ?? null,
        ),
        findById: vi.fn(
          async (loopDefinitionId: string) =>
            loopDefinitions.get(loopDefinitionId) ?? null,
        ),
        deleteById: vi.fn(async () => undefined),
      },
      taskTemplatesRepository: {
        upsert: vi.fn(async (taskTemplate: TaskTemplate) => {
          taskTemplates.set(taskTemplate.taskTemplateId, taskTemplate);
        }),
        findByWorkflowDefinitionId: vi.fn(
          async (workflowDefinitionId: string) =>
            Array.from(taskTemplates.values()).filter(
              (taskTemplate) =>
                taskTemplate.workflowDefinitionId === workflowDefinitionId,
            ),
        ),
        findById: vi.fn(
          async (taskTemplateId: string) =>
            taskTemplates.get(taskTemplateId) ?? null,
        ),
        deleteById: vi.fn(async () => undefined),
      },
      taskTemplateEdgesRepository: {
        insert: vi.fn(async () => undefined),
        insertMany: vi.fn(async () => undefined),
        findAllByWorkflowDefinitionTaskTemplates: vi.fn(
          async (taskTemplateIds: readonly string[]) => {
            const taskTemplateIdSet = new Set(taskTemplateIds);

            return taskTemplateEdges.filter(
              (edge) =>
                taskTemplateIdSet.has(edge.fromTaskTemplateId) &&
                taskTemplateIdSet.has(edge.toTaskTemplateId),
            );
          },
        ),
        findByFromTaskTemplateId: vi.fn(async () => [] as TaskTemplateEdge[]),
        findByToTaskTemplateId: vi.fn(async () => [] as TaskTemplateEdge[]),
        deleteByTaskTemplateId: vi.fn(async () => undefined),
        deleteEdge: vi.fn(async () => undefined),
      },
    },
  };
}

function createEnqueuePort() {
  const requests: Array<Record<string, unknown>> = [];

  return {
    requests,
    port: {
      enqueueTaskDispatch: vi.fn(async (request) => {
        requests.push(request);

        return {
          ok: true as const,
          jobId: `job-${request.taskId}`,
        };
      }),
    },
  };
}

describe("loop expansion", () => {
  it("creates iteration 2 tasks, external downstream edges, and enqueues the next entry task", async () => {
    const workflow = createWorkflow("workflow-1");
    const loopDefinition = createLoopDefinition("workflow-definition-1");
    const devTemplate = createTaskTemplate(
      "dev-template",
      workflow.workflowDefinitionId!,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const reviewTemplate = createTaskTemplate(
      "review-template",
      workflow.workflowDefinitionId!,
    );
    const deployTemplate = createTaskTemplate(
      "deploy-template",
      workflow.workflowDefinitionId!,
    );
    const dev1 = createTask("dev-1", workflow.workflowId, {
      status: "succeeded",
      taskTemplateId: devTemplate.taskTemplateId,
      loopDefinitionId: loopDefinition.loopDefinitionId,
      iteration: 1,
    });
    const review1 = createTask("review-1", workflow.workflowId, {
      status: "succeeded",
      assigneeAgentId: "agent-1",
      taskTemplateId: reviewTemplate.taskTemplateId,
      loopDefinitionId: loopDefinition.loopDefinitionId,
      iteration: 1,
    });
    const deploy = createTask("deploy-1", workflow.workflowId, {
      status: "pending",
      taskTemplateId: deployTemplate.taskTemplateId,
    });
    const { repositories, state } = createRepositories({
      workflow,
      tasks: [dev1, review1, deploy],
      taskEdges: [
        createTaskEdge(dev1.taskId, review1.taskId),
        createTaskEdge(review1.taskId, deploy.taskId),
      ],
      taskTemplates: [devTemplate, reviewTemplate, deployTemplate],
      taskTemplateEdges: [
        createTaskTemplateEdge(
          devTemplate.taskTemplateId,
          reviewTemplate.taskTemplateId,
        ),
      ],
      loopDefinition,
      agent: createAgent("agent-1"),
    });
    const { port, requests } = createEnqueuePort();
    const randomUUIDImpl = vi
      .fn()
      .mockReturnValueOnce("dev-2")
      .mockReturnValueOnce("review-2");

    const result = await expandLoopIteration(
      review1,
      loopDefinition,
      workflow,
      repositories,
      port,
      {
        now: () => "2026-03-17T00:05:00.000Z",
        randomUUIDImpl,
      },
    );

    expect(result).toEqual({
      ok: true,
      createdTaskIds: ["dev-2", "review-2"],
      enqueuedTaskIds: ["dev-2"],
      failures: [],
    });
    expect(state.tasks.get("dev-2")).toMatchObject({
      taskTemplateId: "dev-template",
      loopDefinitionId: "loop-1",
      iteration: 2,
      spawnedFromTaskId: "review-1",
      status: "queued",
    });
    expect(state.tasks.get("review-2")).toMatchObject({
      taskTemplateId: "review-template",
      loopDefinitionId: "loop-1",
      iteration: 2,
      spawnedFromTaskId: "review-1",
      status: "blocked",
    });
    expect(
      repositories.tasksRepository.upsert.mock.calls
        .slice(0, 2)
        .map(([task]: [Task]) => task.status),
    ).toEqual(["blocked", "blocked"]);
    expect(state.taskEdges).toEqual(
      expect.arrayContaining([
        createTaskEdge("dev-2", "review-2"),
        createTaskEdge("review-1", "dev-2"),
        createTaskEdge("review-2", "deploy-1"),
      ]),
    );
    expect(requests).toEqual([
      expect.objectContaining({
        taskId: "dev-2",
        triggerSource: "internal",
      }),
    ]);
  });

  it("lets a later controller exit unlock external downstream work", async () => {
    const workflow = createWorkflow("workflow-1");
    const loopDefinition = createLoopDefinition("workflow-definition-1");
    const devTemplate = createTaskTemplate(
      "dev-template",
      workflow.workflowDefinitionId!,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const reviewTemplate = createTaskTemplate(
      "review-template",
      workflow.workflowDefinitionId!,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const deploy = createTask("deploy-1", workflow.workflowId, {
      status: "pending",
      taskTemplateId: "deploy-template",
    });
    const dev1 = createTask("dev-1", workflow.workflowId, {
      status: "succeeded",
      taskTemplateId: "dev-template",
      loopDefinitionId: loopDefinition.loopDefinitionId,
      iteration: 1,
    });
    const review1 = createTask("review-1", workflow.workflowId, {
      status: "succeeded",
      assigneeAgentId: "agent-1",
      taskTemplateId: "review-template",
      loopDefinitionId: loopDefinition.loopDefinitionId,
      iteration: 1,
    });
    const { repositories, state } = createRepositories({
      workflow,
      tasks: [dev1, review1, deploy],
      taskEdges: [
        createTaskEdge("dev-1", "review-1"),
        createTaskEdge("review-1", "deploy-1"),
      ],
      taskTemplates: [
        devTemplate,
        reviewTemplate,
        createTaskTemplate("deploy-template", workflow.workflowDefinitionId!),
      ],
      taskTemplateEdges: [
        createTaskTemplateEdge("dev-template", "review-template"),
      ],
      loopDefinition,
      agent: createAgent("agent-1"),
    });
    const { port, requests } = createEnqueuePort();

    await expandLoopIteration(
      review1,
      loopDefinition,
      workflow,
      repositories,
      port,
      {
        now: () => "2026-03-17T00:05:00.000Z",
        randomUUIDImpl: vi
          .fn()
          .mockReturnValueOnce("dev-2")
          .mockReturnValueOnce("review-2"),
      },
    );

    state.tasks.set("dev-2", {
      ...state.tasks.get("dev-2")!,
      status: "succeeded",
      updatedAt: "2026-03-17T00:06:00.000Z",
    });
    state.tasks.set("review-2", {
      ...state.tasks.get("review-2")!,
      status: "succeeded",
      assigneeAgentId: "agent-1",
      updatedAt: "2026-03-17T00:07:00.000Z",
    });

    const progression = await progressDownstreamTasks(
      state.tasks.get("review-2")!,
      repositories,
      port,
      {
        now: () => "2026-03-17T00:07:00.000Z",
      },
    );

    expect(progression.enqueuedTaskIds).toEqual(["deploy-1"]);
    expect(requests.at(-1)).toEqual(
      expect.objectContaining({
        taskId: "deploy-1",
      }),
    );
    expect(state.tasks.get("deploy-1")).toMatchObject({
      status: "queued",
    });
  });

  it("stops expansion when maxIterations is exceeded", async () => {
    const workflow = createWorkflow("workflow-1");
    const loopDefinition = createLoopDefinition("workflow-definition-1", {
      maxIterations: 2,
    });
    const review2 = createTask("review-2", workflow.workflowId, {
      status: "succeeded",
      assigneeAgentId: "agent-1",
      taskTemplateId: "review-template",
      loopDefinitionId: loopDefinition.loopDefinitionId,
      iteration: 2,
    });
    const { repositories, state } = createRepositories({
      workflow,
      tasks: [review2],
      taskEdges: [],
      taskTemplates: [
        createTaskTemplate("dev-template", workflow.workflowDefinitionId!),
        createTaskTemplate("review-template", workflow.workflowDefinitionId!),
      ],
      taskTemplateEdges: [],
      loopDefinition,
      agent: createAgent("agent-1"),
    });
    const { port } = createEnqueuePort();

    await expect(
      expandLoopIteration(
        review2,
        loopDefinition,
        workflow,
        repositories,
        port,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: "LOOP_MAX_ITERATIONS_EXCEEDED",
      message: "Loop loop-1 exceeded maxIterations=2",
    });
    expect(Array.from(state.tasks.keys())).toEqual(["review-2"]);
  });

  it("runs a bounded review cycle end-to-end without static graph cycles", async () => {
    const workflow = createWorkflow("workflow-1");
    const loopDefinition = createLoopDefinition("workflow-definition-1");
    const agent = createAgent("agent-1");
    const devTemplate = createTaskTemplate(
      "dev-template",
      workflow.workflowDefinitionId!,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const reviewTemplate = createTaskTemplate(
      "review-template",
      workflow.workflowDefinitionId!,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const deployTemplate = createTaskTemplate(
      "deploy-template",
      workflow.workflowDefinitionId!,
      {
        defaultAssigneeAgentId: "agent-1",
      },
    );
    const dev1 = createTask("dev-1", workflow.workflowId, {
      status: "succeeded",
      assigneeAgentId: "agent-1",
      taskTemplateId: devTemplate.taskTemplateId,
      loopDefinitionId: loopDefinition.loopDefinitionId,
      iteration: 1,
    });
    const review1 = createTask("review-1", workflow.workflowId, {
      status: "queued",
      assigneeAgentId: "agent-1",
      taskTemplateId: reviewTemplate.taskTemplateId,
      loopDefinitionId: loopDefinition.loopDefinitionId,
      iteration: 1,
    });
    const deploy = createTask("deploy-1", workflow.workflowId, {
      status: "pending",
      taskTemplateId: deployTemplate.taskTemplateId,
    });
    const { repositories, state } = createRepositories({
      workflow,
      tasks: [dev1, review1, deploy],
      taskEdges: [
        createTaskEdge("dev-1", "review-1"),
        createTaskEdge("review-1", "deploy-1"),
      ],
      taskTemplates: [devTemplate, reviewTemplate, deployTemplate],
      taskTemplateEdges: [
        createTaskTemplateEdge("dev-template", "review-template"),
      ],
      loopDefinition,
      agent,
    });
    const { port, requests } = createEnqueuePort();
    const registry = {
      cli: {
        runtimeType: "cli" as const,
        execute: vi.fn(async (task: Task) => {
          if (
            task.taskTemplateId === "review-template" &&
            task.iteration === 1
          ) {
            return {
              ok: true as const,
              output: { loopAction: "repeat" },
            };
          }

          if (
            task.taskTemplateId === "review-template" &&
            task.iteration === 2
          ) {
            return {
              ok: true as const,
              output: { loopAction: "exit" },
            };
          }

          return {
            ok: true as const,
            output: {},
          };
        }),
      },
    };

    await executeTaskLifecycle(
      {
        taskId: "review-1",
        workflowId: workflow.workflowId,
        triggerSource: "manual",
        requestedAt: "2026-03-17T00:00:00.000Z",
      },
      repositories,
      registry,
      port,
      {
        now: () => "2026-03-17T00:05:00.000Z",
        randomUUIDImpl: vi
          .fn()
          .mockReturnValueOnce("run-review-1")
          .mockReturnValueOnce("dev-2")
          .mockReturnValueOnce("review-2"),
      },
    );

    await executeTaskLifecycle(
      {
        taskId: "dev-2",
        workflowId: workflow.workflowId,
        triggerSource: "internal",
        requestedAt: "2026-03-17T00:05:00.000Z",
      },
      repositories,
      registry,
      port,
      {
        now: () => "2026-03-17T00:06:00.000Z",
        randomUUIDImpl: () => "run-dev-2",
      },
    );

    await executeTaskLifecycle(
      {
        taskId: "review-2",
        workflowId: workflow.workflowId,
        triggerSource: "internal",
        requestedAt: "2026-03-17T00:06:00.000Z",
      },
      repositories,
      registry,
      port,
      {
        now: () => "2026-03-17T00:07:00.000Z",
        randomUUIDImpl: () => "run-review-2",
      },
    );

    await executeTaskLifecycle(
      {
        taskId: "deploy-1",
        workflowId: workflow.workflowId,
        triggerSource: "internal",
        requestedAt: "2026-03-17T00:07:00.000Z",
      },
      repositories,
      registry,
      port,
      {
        now: () => "2026-03-17T00:08:00.000Z",
        randomUUIDImpl: () => "run-deploy-1",
      },
    );

    expect(requests.map((request) => request.taskId)).toEqual([
      "dev-2",
      "review-2",
      "deploy-1",
    ]);
    expect(state.tasks.get("dev-2")).toMatchObject({
      iteration: 2,
      status: "succeeded",
    });
    expect(state.tasks.get("review-2")).toMatchObject({
      iteration: 2,
      status: "succeeded",
    });
    expect(state.tasks.get("deploy-1")).toMatchObject({
      status: "succeeded",
    });
    expect(state.workflows.get("workflow-1")).toMatchObject({
      status: "succeeded",
    });
  });
});
