import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import { parseAgentBody, parseAgentsQuery } from "../schemas/agents.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

export function registerAgentRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post("/agents", async (request) => {
    const agent = parseAgentBody(request.body);

    await deps.agentsRepository.upsert(agent);

    return agent;
  });

  app.get("/agents", async (request) => {
    const query = parseAgentsQuery(request.query);

    if (query.enabled) {
      return deps.agentsRepository.findEnabled();
    }

    return deps.agentsRepository.findAll();
  });

  app.get("/agents/:agentId", async (request) => {
    const params = expectRecord(request.params, "params");
    const agentId = expectString(params.agentId, "agentId");
    const agent = await deps.agentsRepository.findById(agentId);

    if (!agent) {
      throw notFound(`Agent ${agentId} not found`);
    }

    return agent;
  });

  app.delete("/agents/:agentId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const agentId = expectString(params.agentId, "agentId");

    await deps.agentsRepository.deleteById(agentId);

    return reply.status(204).send();
  });
}
