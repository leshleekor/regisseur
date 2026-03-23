import { describe, expect, it } from "vitest";

import type {
  AgentDefinition,
  LoopDefinition,
  TaskTemplate,
  TaskTemplateEdge,
  WorkflowDefinition,
} from "@regisseur/core";

import {
  buildWorkflowDefinitionBundle,
  cloneWorkflowDefinitionBundle,
  parseWorkflowDefinitionImport,
  workflowDefinitionStartPreflight,
} from "./workflow-definition-tools";

function definition(): WorkflowDefinition {
  return {
    workflowDefinitionId: "workflow-definition-source",
    name: "Source Definition",
    description: "",
    enabled: true,
    metadata: {},
    createdAt: "2026-03-23T00:00:00.000Z",
    updatedAt: "2026-03-23T00:00:00.000Z",
  };
}

function taskTemplate(taskTemplateId: string, overrides?: Partial<TaskTemplate>): TaskTemplate {
  return {
    taskTemplateId,
    workflowDefinitionId: "workflow-definition-source",
    title: taskTemplateId,
    payload: {
      promptTemplate: "hello",
    },
    retryCount: 0,
    createdAt: "2026-03-23T00:00:00.000Z",
    updatedAt: "2026-03-23T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

function agent(agentId: string, overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    agentId,
    name: agentId,
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
    ...overrides,
  };
}

describe("workflowDefinitionStartPreflight", () => {
  it("flags graph, loop, assignee, and capability issues", () => {
    const findings = workflowDefinitionStartPreflight({
      definition: {
        ...definition(),
        enabled: false,
      },
      taskTemplates: [
        taskTemplate("task-a", {
          metadata: {
            requiredCapabilities: ["analysis"],
          },
        }),
        taskTemplate("task-b", {
          defaultAssigneeAgentId: "agent-disabled",
        }),
      ],
      edges: [
        {
          fromTaskTemplateId: "task-a",
          toTaskTemplateId: "task-b",
          type: "depends_on",
          injectOutput: true,
        },
        {
          fromTaskTemplateId: "task-b",
          toTaskTemplateId: "task-a",
          type: "depends_on",
        },
      ],
      agents: [
        agent("agent-disabled", {
          enabled: false,
          capabilities: [],
        }),
      ],
      loop: {
        loopDefinitionId: "loop-1",
        workflowDefinitionId: "workflow-definition-source",
        name: "Review Loop",
        controllerTaskTemplateId: "missing-controller",
        entryTaskTemplateIds: ["task-a"],
        bodyTaskTemplateIds: ["task-b"],
        maxIterations: 0,
        createdAt: "2026-03-23T00:00:00.000Z",
        updatedAt: "2026-03-23T00:00:00.000Z",
      } satisfies LoopDefinition,
    });

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "DEFINITION_DISABLED",
        "GRAPH_CYCLE",
        "INJECT_OUTPUT_MISSING_KEY",
        "LOOP_CONTROLLER_MISSING",
        "LOOP_ENTRY_NOT_IN_BODY",
        "LOOP_MAX_ITERATIONS_INVALID",
        "ASSIGNEE_DISABLED",
        "NO_CAPABLE_AGENT",
      ]),
    );
  });
});

describe("cloneWorkflowDefinitionBundle", () => {
  it("clones a bundle with fresh ids and target references", () => {
    const bundle = buildWorkflowDefinitionBundle({
      definition: definition(),
      taskTemplates: [
        taskTemplate("task-a"),
        taskTemplate("task-b"),
      ],
      edges: [
        {
          fromTaskTemplateId: "task-a",
          toTaskTemplateId: "task-b",
          type: "depends_on",
          injectOutput: true,
          outputMergeKey: "upstream",
        } satisfies TaskTemplateEdge,
      ],
      loop: {
        loopDefinitionId: "loop-1",
        workflowDefinitionId: "workflow-definition-source",
        name: "Loop",
        controllerTaskTemplateId: "task-a",
        entryTaskTemplateIds: ["task-b"],
        bodyTaskTemplateIds: ["task-b"],
        maxIterations: 3,
        createdAt: "2026-03-23T00:00:00.000Z",
        updatedAt: "2026-03-23T00:00:00.000Z",
      },
      schedules: [
        {
          scheduleId: "schedule-1",
          type: "cron",
          cronExpression: "*/5 * * * *",
          enabled: true,
          targetType: "workflow",
          targetId: "workflow-definition-source",
          createdAt: "2026-03-23T00:00:00.000Z",
          updatedAt: "2026-03-23T00:00:00.000Z",
        },
      ],
    });

    const cloned = cloneWorkflowDefinitionBundle(bundle);

    expect(cloned.definition.workflowDefinitionId).not.toBe(bundle.definition.workflowDefinitionId);
    expect(cloned.taskTemplates[0].workflowDefinitionId).toBe(cloned.definition.workflowDefinitionId);
    expect(cloned.taskTemplates[0].taskTemplateId).not.toBe(bundle.taskTemplates[0].taskTemplateId);
    expect(cloned.edges[0].fromTaskTemplateId).toBe(cloned.taskTemplates[0].taskTemplateId);
    expect(cloned.loop?.workflowDefinitionId).toBe(cloned.definition.workflowDefinitionId);
    expect(cloned.schedules[0].targetId).toBe(cloned.definition.workflowDefinitionId);
  });
});

describe("parseWorkflowDefinitionImport", () => {
  it("accepts a raw workflow definition object", () => {
    const parsed = parseWorkflowDefinitionImport(definition());

    expect(parsed.definition.workflowDefinitionId).toBe("workflow-definition-source");
    expect(parsed.taskTemplates).toEqual([]);
    expect(parsed.loop).toBeNull();
  });
});
