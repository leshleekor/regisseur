import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SCHEDULE_TRIGGER_JOB_NAME,
  SCHEDULE_TRIGGER_QUEUE_NAME,
  TASK_DISPATCH_JOB_NAME,
  TASK_DISPATCH_QUEUE_NAME,
  createScheduleTriggerJobPayload,
  createScheduleTriggerRegistrationPort,
  createScheduleTriggerWorker,
  createTaskDispatchJobPayload,
  createTaskDispatchWorker,
  enqueueScheduleTrigger,
  enqueueTaskDispatch,
  registerCronScheduleTrigger,
} from "./index.js";
import type {
  QueueJobLike,
  QueueLike,
  WorkerFactory,
  WorkerLike,
} from "./index.js";
import type {
  ScheduleTriggerJobPayload,
  TaskDispatchJobPayload,
} from "./payloads.js";
import type { CreateBullMqWorkerOptions } from "./workers.js";

const TEST_CONNECTION = {
  host: "127.0.0.1",
  port: 6379,
} as const;

describe("queue-bullmq payload helpers", () => {
  it("creates task dispatch and schedule trigger payloads without mutating the inputs", () => {
    const taskPayloadInput: TaskDispatchJobPayload = {
      taskId: "task-1",
      workflowId: "workflow-1",
      triggerSource: "schedule",
      requestedAt: "2026-03-13T00:00:00.000Z",
    };
    const schedulePayloadInput: ScheduleTriggerJobPayload = {
      scheduleId: "schedule-1",
      targetType: "workflow",
      targetId: "workflow-1",
      triggeredAt: "2026-03-13T00:00:00.000Z",
    };

    const taskPayload = createTaskDispatchJobPayload(taskPayloadInput);
    const schedulePayload =
      createScheduleTriggerJobPayload(schedulePayloadInput);

    expect(taskPayload).toEqual(taskPayloadInput);
    expect(schedulePayload).toEqual(schedulePayloadInput);
    expect(taskPayload).not.toBe(taskPayloadInput);
    expect(schedulePayload).not.toBe(schedulePayloadInput);
  });
});

describe("queue-bullmq enqueue helpers", () => {
  it("enqueues task dispatch jobs with mapped delay options", async () => {
    const payload: TaskDispatchJobPayload = {
      taskId: "task-1",
      workflowId: "workflow-1",
      triggerSource: "manual",
      requestedAt: "2026-03-13T00:00:00.000Z",
    };
    const queue: QueueLike<TaskDispatchJobPayload> = {
      add: vi.fn().mockResolvedValue({
        id: "dispatch-job-1",
        name: TASK_DISPATCH_JOB_NAME,
        data: payload,
      }),
    };

    const result = await enqueueTaskDispatch(queue, payload, {
      attempts: 3,
      delayMs: 1_500,
      jobId: "dispatch-job-1",
    });

    expect(queue.add).toHaveBeenCalledWith(TASK_DISPATCH_JOB_NAME, payload, {
      attempts: 3,
      delay: 1_500,
      jobId: "dispatch-job-1",
      removeOnComplete: undefined,
      removeOnFail: undefined,
    });
    expect(result).toEqual({
      jobId: "dispatch-job-1",
      jobName: TASK_DISPATCH_JOB_NAME,
      options: {
        attempts: 3,
        delay: 1_500,
        jobId: "dispatch-job-1",
        removeOnComplete: undefined,
        removeOnFail: undefined,
      },
      payload,
    });
  });

  it("enqueues schedule trigger jobs and maps cron registrations to repeat options", async () => {
    const payload: ScheduleTriggerJobPayload = {
      scheduleId: "schedule-1",
      targetType: "task",
      targetId: "task-1",
      triggeredAt: "2026-03-13T00:00:00.000Z",
    };
    const queue: QueueLike<ScheduleTriggerJobPayload> = {
      add: vi.fn().mockResolvedValue({
        id: "schedule-job-1",
        name: SCHEDULE_TRIGGER_JOB_NAME,
        data: payload,
      }),
    };

    const delayedResult = await enqueueScheduleTrigger(queue, payload, {
      delayMs: 10_000,
    });
    const cronResult = await registerCronScheduleTrigger(queue, payload, {
      cronExpression: "0 9 * * *",
      timezone: "Asia/Seoul",
      jobId: "cron-schedule-1",
    });

    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      SCHEDULE_TRIGGER_JOB_NAME,
      payload,
      {
        attempts: undefined,
        delay: 10_000,
        jobId: undefined,
        removeOnComplete: undefined,
        removeOnFail: undefined,
      },
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      SCHEDULE_TRIGGER_JOB_NAME,
      payload,
      {
        attempts: undefined,
        jobId: "cron-schedule-1",
        removeOnComplete: undefined,
        removeOnFail: undefined,
        repeat: {
          pattern: "0 9 * * *",
          tz: "Asia/Seoul",
        },
      },
    );
    expect(delayedResult.jobId).toBe("schedule-job-1");
    expect(cronResult.jobName).toBe(SCHEDULE_TRIGGER_JOB_NAME);
  });

  it("creates a scheduler-compatible schedule trigger registration port", async () => {
    const payload: ScheduleTriggerJobPayload = {
      scheduleId: "schedule-1",
      targetType: "workflow",
      targetId: "workflow-1",
      triggeredAt: "2026-03-13T00:00:00.000Z",
    };
    const queue: QueueLike<ScheduleTriggerJobPayload> = {
      add: vi.fn().mockResolvedValue({
        id: "port-job-1",
        name: SCHEDULE_TRIGGER_JOB_NAME,
        data: payload,
      }),
    };

    const port = createScheduleTriggerRegistrationPort(queue);

    await port.enqueueScheduleTrigger(payload, { delayMs: 2_000 });
    await port.registerCronScheduleTrigger(payload, {
      cronExpression: "*/5 * * * *",
    });

    expect(queue.add).toHaveBeenCalledTimes(2);
  });
});

describe("queue-bullmq worker wiring", () => {
  let worker: WorkerLike | undefined;

  afterEach(async () => {
    if (worker) {
      await worker.close();
      worker = undefined;
    }
  });

  it("wires task dispatch workers to the injected processor", async () => {
    const payload: TaskDispatchJobPayload = {
      taskId: "task-1",
      workflowId: "workflow-1",
      triggerSource: "internal",
      requestedAt: "2026-03-13T00:00:00.000Z",
    };
    const processor = vi.fn(async () => undefined);
    let capturedProcessor:
      | ((job: QueueJobLike<TaskDispatchJobPayload>) => Promise<void>)
      | undefined;

    const workerFactory: WorkerFactory<
      TaskDispatchJobPayload,
      CreateBullMqWorkerOptions
    > = vi.fn((queueName, wrappedProcessor, options) => {
      capturedProcessor = wrappedProcessor;
      expect(queueName).toBe(TASK_DISPATCH_QUEUE_NAME);
      expect(options.connection).toEqual(TEST_CONNECTION);

      return {
        close: vi.fn(async () => undefined),
      };
    });

    worker = createTaskDispatchWorker(
      processor,
      { connection: TEST_CONNECTION },
      workerFactory,
    );

    await capturedProcessor?.({
      id: "dispatch-job-1",
      name: TASK_DISPATCH_JOB_NAME,
      data: payload,
    });

    expect(processor).toHaveBeenCalledWith(payload, {
      id: "dispatch-job-1",
      name: TASK_DISPATCH_JOB_NAME,
      data: payload,
    });
  });

  it("wires schedule trigger workers to the injected processor", async () => {
    const payload: ScheduleTriggerJobPayload = {
      scheduleId: "schedule-1",
      targetType: "workflow",
      targetId: "workflow-1",
      triggeredAt: "2026-03-13T00:00:00.000Z",
    };
    const processor = vi.fn(async () => undefined);
    let capturedProcessor:
      | ((job: QueueJobLike<ScheduleTriggerJobPayload>) => Promise<void>)
      | undefined;

    const workerFactory: WorkerFactory<
      ScheduleTriggerJobPayload,
      CreateBullMqWorkerOptions
    > = vi.fn((queueName, wrappedProcessor) => {
      capturedProcessor = wrappedProcessor;
      expect(queueName).toBe(SCHEDULE_TRIGGER_QUEUE_NAME);

      return {
        close: vi.fn(async () => undefined),
      };
    });

    worker = createScheduleTriggerWorker(
      processor,
      { connection: TEST_CONNECTION },
      workerFactory,
    );

    await capturedProcessor?.({
      id: "schedule-job-1",
      name: SCHEDULE_TRIGGER_JOB_NAME,
      data: payload,
    });

    expect(processor).toHaveBeenCalledWith(payload, {
      id: "schedule-job-1",
      name: SCHEDULE_TRIGGER_JOB_NAME,
      data: payload,
    });
  });
});
