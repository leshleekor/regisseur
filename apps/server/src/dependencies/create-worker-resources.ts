import {
  createTaskDispatchWorker,
  type BullMqConnectionConfig,
  type TaskDispatchJobPayload,
  type WorkerLike,
} from "@regisseur/queue-bullmq";

import type { WorkerResources } from "../types.js";

export type TaskDispatchProcessor = (
  payload: TaskDispatchJobPayload,
) => Promise<void>;

export interface CreateWorkerResourcesOptions {
  connection: BullMqConnectionConfig;
  // NOTE: processor is required. No noop default is provided intentionally.
  // Starting a worker without a real processor would silently consume and
  // discard jobs, leaving tasks stuck in "queued" state with no execution.
  // This function is called in the execution lifecycle work when a real
  // processor is available.
  taskDispatchProcessor: TaskDispatchProcessor;
  createTaskDispatchWorkerImpl?: (
    processor: (payload: TaskDispatchJobPayload) => Promise<void>,
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
  const taskDispatchWorker = createTaskDispatchWorkerImpl(
    async (payload) => {
      await options.taskDispatchProcessor(payload);
    },
    {
      connection: options.connection,
    },
  );

  return {
    taskDispatchWorker,
    async close() {
      await taskDispatchWorker.close();
    },
  };
}
