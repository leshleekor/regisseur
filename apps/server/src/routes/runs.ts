import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import { parseRunBody, parseRunsQuery } from "../schemas/runs.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

export function registerRunRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post("/runs", async (request) => {
    const run = parseRunBody(request.body);

    await deps.runsRepository.upsert(run);

    return run;
  });

  app.get("/runs", async (request) => {
    const query = parseRunsQuery(request.query);

    if ("taskId" in query) {
      return deps.runsRepository.findByTaskId(query.taskId);
    }

    if ("agentId" in query) {
      return deps.runsRepository.findByAgentId(query.agentId);
    }

    return deps.runsRepository.findByStatus(query.status);
  });

  app.get("/runs/:runId", async (request) => {
    const params = expectRecord(request.params, "params");
    const runId = expectString(params.runId, "runId");
    const run = await deps.runsRepository.findById(runId);

    if (!run) {
      throw notFound(`Run ${runId} not found`);
    }

    return run;
  });

  app.delete("/runs/:runId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const runId = expectString(params.runId, "runId");

    await deps.runsRepository.deleteById(runId);

    return reply.status(204).send();
  });
}
