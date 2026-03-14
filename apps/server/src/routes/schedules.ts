import type { FastifyInstance } from "fastify";

import { notFound } from "../errors/http-error.js";
import {
  parseScheduleBody,
  parseSchedulesQuery,
} from "../schemas/schedules.js";
import { expectRecord, expectString } from "../utils/parse-body.js";
import type { ServerDependencies } from "../types.js";

export function registerScheduleRoutes(
  app: FastifyInstance,
  deps: ServerDependencies,
): void {
  app.post("/schedules", async (request) => {
    const schedule = parseScheduleBody(request.body);

    await deps.schedulesRepository.upsert(schedule);

    return schedule;
  });

  app.get("/schedules", async (request) => {
    const query = parseSchedulesQuery(request.query);

    if ("enabled" in query) {
      return deps.schedulesRepository.findEnabled();
    }

    if ("targetType" in query) {
      return deps.schedulesRepository.findByTarget(
        query.targetType,
        query.targetId,
      );
    }

    return deps.schedulesRepository.findAll();
  });

  app.get("/schedules/:scheduleId", async (request) => {
    const params = expectRecord(request.params, "params");
    const scheduleId = expectString(params.scheduleId, "scheduleId");
    const schedule = await deps.schedulesRepository.findById(scheduleId);

    if (!schedule) {
      throw notFound(`Schedule ${scheduleId} not found`);
    }

    return schedule;
  });

  app.delete("/schedules/:scheduleId", async (request, reply) => {
    const params = expectRecord(request.params, "params");
    const scheduleId = expectString(params.scheduleId, "scheduleId");

    await deps.schedulesRepository.deleteById(scheduleId);

    return reply.status(204).send();
  });
}
