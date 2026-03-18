import {
  createScheduleTriggerWorker,
  createTaskDispatchWorker,
  type BullMqConnectionConfig,
  type ScheduleTriggerJobPayload,
  type TaskDispatchJobPayload,
  type WorkerLike,
} from "@regisseur/queue-bullmq";

import type { WorkerResources } from "../types.js";

export type TaskDispatchProcessor = (
  payload: TaskDispatchJobPayload,
) => Promise<void>;

export type ScheduleTriggerProcessor = (
  payload: ScheduleTriggerJobPayload,
) => Promise<void>;

export interface CreateWorkerResourcesOptions {
  connection: BullMqConnectionConfig;
  // NOTE: processor is required. No noop default is provided intentionally.
  // Starting a worker without a real processor would silently consume and
  // discard jobs, leaving tasks stuck in "queued" state with no execution.
  // This function is called in the execution lifecycle work when a real
  // processor is available.
  taskDispatchProcessor: TaskDispatchProcessor;
  scheduleTriggerProcessor: ScheduleTriggerProcessor;
  createTaskDispatchWorkerImpl?: (
    processor: (payload: TaskDispatchJobPayload) => Promise<void>,
    options: {
      connection: BullMqConnectionConfig;
    },
  ) => WorkerLike;
  createScheduleTriggerWorkerImpl?: (
    processor: (payload: ScheduleTriggerJobPayload) => Promise<void>,
    options: {
      connection: BullMqConnectionConfig;
    },
  ) => WorkerLike;
}

export function createWorkerResources(
  options: CreateWorkerResourcesOptions,
): WorkerResources {
  const createTaskDispatchWorkerImpl =
    options.createTaskDispatchWorkerImpl ?? createTaskDispatchWorker;
  const createScheduleTriggerWorkerImpl =
    options.createScheduleTriggerWorkerImpl ?? createScheduleTriggerWorker;
  const taskDispatchWorker = createTaskDispatchWorkerImpl(
    async (payload) => {
      await options.taskDispatchProcessor(payload);
    },
    {
      connection: options.connection,
    },
  );
  const scheduleTriggerWorker = createScheduleTriggerWorkerImpl(
    async (payload) => {
      await options.scheduleTriggerProcessor(payload);
    },
    {
      connection: options.connection,
    },
  );

  return {
    taskDispatchWorker,
    scheduleTriggerWorker,
    async close() {
      await Promise.all([
        taskDispatchWorker.close(),
        scheduleTriggerWorker.close(),
      ]);
    },
  };
}
