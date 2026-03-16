import { describe, expect, it, vi } from "vitest";
import type { Schedule } from "@regisseur/core";

import {
  registerPersistedSchedule,
  registerPersistedSchedulesOnStart,
  replayEnabledSchedules,
} from "./registration.js";

function createSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    scheduleId: "schedule-1",
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

function createRegistrationPort() {
  return {
    enqueueScheduleTrigger: vi.fn(async () => ({
      jobId: "schedule-1",
      jobName: "schedule.trigger",
    })),
    registerCronScheduleTrigger: vi.fn(async () => ({
      jobId: "schedule-1",
      jobName: "schedule.trigger",
    })),
  };
}

describe("schedule registration helpers", () => {
  it("registers a persisted schedule through the scheduler port", async () => {
    const port = createRegistrationPort();

    await registerPersistedSchedule(createSchedule(), port);

    expect(port.enqueueScheduleTrigger).toHaveBeenCalledTimes(1);
  });

  it("replays enabled schedules in order", async () => {
    const port = createRegistrationPort();
    const schedules = [
      createSchedule({ scheduleId: "schedule-1" }),
      createSchedule({
        scheduleId: "schedule-2",
        type: "cron",
        runAt: undefined,
        cronExpression: "0 * * * *",
      }),
    ];

    const results = await replayEnabledSchedules(schedules, port);

    expect(results).toHaveLength(2);
    expect(port.enqueueScheduleTrigger).toHaveBeenCalledTimes(1);
    expect(port.registerCronScheduleTrigger).toHaveBeenCalledTimes(1);
  });

  it("loads enabled schedules from the repository during startup replay", async () => {
    const port = createRegistrationPort();
    const schedulesRepository = {
      findEnabled: vi.fn(async () => [createSchedule()]),
    };

    await registerPersistedSchedulesOnStart(schedulesRepository, port);

    expect(schedulesRepository.findEnabled).toHaveBeenCalledTimes(1);
    expect(port.enqueueScheduleTrigger).toHaveBeenCalledTimes(1);
  });
});
