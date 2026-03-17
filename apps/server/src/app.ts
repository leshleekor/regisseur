import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { registerErrorHandler } from "./errors/error-handler.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLoopRoutes } from "./routes/loops.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerScheduleRoutes } from "./routes/schedules.js";
import { registerTaskEdgeRoutes } from "./routes/task-edges.js";
import { registerTaskTemplateEdgeRoutes } from "./routes/task-template-edges.js";
import { registerTaskTemplateRoutes } from "./routes/task-templates.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerWorkflowDefinitionRoutes } from "./routes/workflow-definitions.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import type { ServerDependencies } from "./types.js";

function assertDependency(
  value: unknown,
  dependencyName: string,
): asserts value {
  if (!value) {
    throw new Error(`Missing dependency: ${dependencyName}`);
  }
}

function assertServerDependencies(
  deps: Partial<ServerDependencies>,
): asserts deps is ServerDependencies {
  assertDependency(deps.agentsRepository, "agentsRepository");
  assertDependency(deps.workflowsRepository, "workflowsRepository");
  assertDependency(deps.tasksRepository, "tasksRepository");
  assertDependency(deps.taskEdgesRepository, "taskEdgesRepository");
  assertDependency(
    deps.workflowDefinitionsRepository,
    "workflowDefinitionsRepository",
  );
  assertDependency(deps.taskTemplatesRepository, "taskTemplatesRepository");
  assertDependency(
    deps.taskTemplateEdgesRepository,
    "taskTemplateEdgesRepository",
  );
  assertDependency(deps.loopDefinitionsRepository, "loopDefinitionsRepository");
  assertDependency(deps.schedulesRepository, "schedulesRepository");
  assertDependency(deps.runsRepository, "runsRepository");
  assertDependency(deps.enqueuePort, "enqueuePort");
}

export function buildApp(deps: Partial<ServerDependencies>): FastifyInstance {
  assertServerDependencies(deps);

  const app = Fastify({
    logger: deps.logger ?? false,
  });

  registerErrorHandler(app);
  registerHealthRoutes(app);
  registerAgentRoutes(app, deps);
  registerWorkflowRoutes(app, deps);
  registerWorkflowDefinitionRoutes(app, deps);
  registerTaskRoutes(app, deps);
  registerTaskEdgeRoutes(app, deps);
  registerTaskTemplateRoutes(app, deps);
  registerTaskTemplateEdgeRoutes(app, deps);
  registerLoopRoutes(app, deps);
  registerScheduleRoutes(app, deps);
  registerRunRoutes(app, deps);

  return app;
}
