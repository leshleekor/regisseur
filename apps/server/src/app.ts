import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { registerErrorHandler } from "./errors/error-handler.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerScheduleRoutes } from "./routes/schedules.js";
import { registerTaskRoutes } from "./routes/tasks.js";
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
  assertDependency(deps.schedulesRepository, "schedulesRepository");
  assertDependency(deps.runsRepository, "runsRepository");
  assertDependency(deps.dispatcher, "dispatcher");
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
  registerTaskRoutes(app, deps);
  registerScheduleRoutes(app, deps);
  registerRunRoutes(app, deps);

  return app;
}
