import type { Schedule } from "@regisseur/core";
import {
  registerSchedule,
  type RegisteredScheduleResult,
  type ScheduleRegistrationPort,
} from "@regisseur/scheduler";

import type { SchedulesRepositoryLike } from "../types.js";

export async function registerPersistedSchedule(
  schedule: Schedule,
  port: ScheduleRegistrationPort,
): Promise<RegisteredScheduleResult> {
  return registerSchedule(schedule, port);
}

export async function replayEnabledSchedules(
  schedules: readonly Schedule[],
  port: ScheduleRegistrationPort,
): Promise<RegisteredScheduleResult[]> {
  const results: RegisteredScheduleResult[] = [];

  for (const schedule of schedules) {
    results.push(await registerPersistedSchedule(schedule, port));
  }

  return results;
}

export async function registerPersistedSchedulesOnStart(
  schedulesRepository: Pick<SchedulesRepositoryLike, "findEnabled">,
  port: ScheduleRegistrationPort,
): Promise<RegisteredScheduleResult[]> {
  const schedules = await schedulesRepository.findEnabled();

  return replayEnabledSchedules(schedules, port);
}
