import { describe, expect, it, vi } from "vitest";

import {
  createScheduleTriggerRequest,
  isScheduleRegistrationEnabled,
  registerCronSchedule,
  registerOneTimeSchedule,
  registerSchedule,
} from "./index.js";
import type {
  RegisteredScheduleResult,
  ScheduleRegistrationPort,
} from "./index.js";
import type { Schedule } from "@regisseur/core";

function createSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    scheduleId: "schedule-1",
    type: "once",
    runAt: "2026-03-13T00:00:05.000Z",
    enabled: true,
    targetType: "workflow",
    targetId: "workflow-1",
    createdAt: "2026-03-13T00:00:00.000Z",
    updatedAt: "2026-03-13T00:00:00.000Z",
    ...overrides,
  };
}

function createRegistrationPort(): ScheduleRegistrationPort {
  return {
    enqueueScheduleTrigger: vi.fn(async () => ({
      jobId: "once-job-1",
      jobName: "schedule.trigger",
    })),
    registerCronScheduleTrigger: vi.fn(async () => ({
      jobId: "cron-job-1",
      jobName: "schedule.trigger",
    })),
  };
}

describe("scheduler registration helpers", () => {
  it("builds a schedule trigger request from a schedule", () => {
    const schedule = createSchedule();

    expect(
      createScheduleTriggerRequest(schedule, "2026-03-13T00:00:00.000Z"),
    ).toEqual({
      scheduleId: "schedule-1",
      targetType: "workflow",
      targetId: "workflow-1",
      triggeredAt: "2026-03-13T00:00:00.000Z",
    });
  });

  it("identifies whether schedule registration is enabled", () => {
    expect(isScheduleRegistrationEnabled(createSchedule())).toBe(true);
    expect(
      isScheduleRegistrationEnabled(createSchedule({ enabled: false })),
    ).toBe(false);
  });

  it("registers one-time schedules through delayed enqueue requests", async () => {
    const schedule = createSchedule();
    const port = createRegistrationPort();
    const now = new Date("2026-03-13T00:00:00.000Z");

    const result = await registerOneTimeSchedule(schedule, port, { now });

    expect(port.enqueueScheduleTrigger).toHaveBeenCalledWith(
      {
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-1",
        triggeredAt: "2026-03-13T00:00:00.000Z",
      },
      {
        delayMs: 5_000,
      },
    );
    expect(result).toEqual<RegisteredScheduleResult>({
      scheduleId: "schedule-1",
      scheduleType: "once",
      skipped: false,
      triggerRequest: {
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-1",
        triggeredAt: "2026-03-13T00:00:00.000Z",
      },
      delayMs: 5_000,
      jobId: "once-job-1",
      jobName: "schedule.trigger",
    });
  });

  it("registers cron schedules through the cron registration port", async () => {
    const schedule = createSchedule({
      type: "cron",
      runAt: undefined,
      cronExpression: "0 9 * * *",
      timezone: "Asia/Seoul",
      targetType: "task",
      targetId: "task-1",
    });
    const port = createRegistrationPort();
    const now = new Date("2026-03-13T00:00:00.000Z");

    const result = await registerCronSchedule(schedule, port, { now });

    expect(port.registerCronScheduleTrigger).toHaveBeenCalledWith(
      {
        scheduleId: "schedule-1",
        targetType: "task",
        targetId: "task-1",
        triggeredAt: "2026-03-13T00:00:00.000Z",
      },
      {
        cronExpression: "0 9 * * *",
        timezone: "Asia/Seoul",
      },
    );
    expect(result).toEqual<RegisteredScheduleResult>({
      scheduleId: "schedule-1",
      scheduleType: "cron",
      skipped: false,
      triggerRequest: {
        scheduleId: "schedule-1",
        targetType: "task",
        targetId: "task-1",
        triggeredAt: "2026-03-13T00:00:00.000Z",
      },
      cronExpression: "0 9 * * *",
      timezone: "Asia/Seoul",
      jobId: "cron-job-1",
      jobName: "schedule.trigger",
    });
  });

  it("routes registerSchedule to the correct registration strategy", async () => {
    const onceSchedule = createSchedule();
    const cronSchedule = createSchedule({
      type: "cron",
      runAt: undefined,
      cronExpression: "*/5 * * * *",
    });
    const port = createRegistrationPort();
    const now = new Date("2026-03-13T00:00:00.000Z");

    const onceResult = await registerSchedule(onceSchedule, port, { now });
    const cronResult = await registerSchedule(cronSchedule, port, { now });

    expect(onceResult.scheduleType).toBe("once");
    expect(cronResult.scheduleType).toBe("cron");
  });

  it("throws when one-time schedules omit runAt", async () => {
    const schedule = createSchedule({ runAt: undefined });
    const port = createRegistrationPort();

    await expect(registerOneTimeSchedule(schedule, port)).rejects.toThrow(
      "requires runAt",
    );
  });

  it("throws when cron schedules omit cronExpression", async () => {
    const schedule = createSchedule({
      type: "cron",
      runAt: undefined,
      cronExpression: undefined,
    });
    const port = createRegistrationPort();

    await expect(registerCronSchedule(schedule, port)).rejects.toThrow(
      "requires cronExpression",
    );
  });

  it("skips disabled schedules without calling the registration port", async () => {
    const schedule = createSchedule({ enabled: false });
    const port = createRegistrationPort();

    const result = await registerSchedule(schedule, port);

    expect(port.enqueueScheduleTrigger).not.toHaveBeenCalled();
    expect(port.registerCronScheduleTrigger).not.toHaveBeenCalled();
    expect(result).toEqual<RegisteredScheduleResult>({
      scheduleId: "schedule-1",
      scheduleType: "once",
      skipped: true,
      reason: "disabled",
    });
  });
});
