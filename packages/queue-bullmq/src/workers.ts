import { Worker } from "bullmq";
import type { Job, WorkerOptions } from "bullmq";

import {
  SCHEDULE_TRIGGER_QUEUE_NAME,
  TASK_DISPATCH_QUEUE_NAME,
} from "./constants.js";
import type {
  ScheduleTriggerJobPayload,
  TaskDispatchJobPayload,
} from "./payloads.js";
import type {
  QueueJobLike,
  WorkerFactory,
  WorkerLike,
  WorkerProcessor,
} from "./ports.js";
import type { BullMqConnectionConfig } from "./queues.js";

/**
 * Options accepted by worker creation helpers.
 */
export interface CreateBullMqWorkerOptions {
  connection: BullMqConnectionConfig;
  workerOptions?: Omit<WorkerOptions, "connection">;
}

function createBullMqWorkerJob<TPayload>(
  job: Job<TPayload, void, string>,
): QueueJobLike<TPayload> {
  return {
    id: job.id,
    name: job.name,
    data: job.data,
  };
}

function defaultWorkerFactory<TPayload>(
  queueName: string,
  processor: (job: QueueJobLike<TPayload>) => Promise<void>,
  options: CreateBullMqWorkerOptions,
): WorkerLike {
  return new Worker<TPayload, void, string>(
    queueName,
    async (job) => {
      await processor(createBullMqWorkerJob(job));
    },
    {
      ...options.workerOptions,
      connection: options.connection,
    },
  );
}

function createWorker<TPayload>(
  queueName: string,
  processor: WorkerProcessor<TPayload>,
  options: CreateBullMqWorkerOptions,
  workerFactory: WorkerFactory<
    TPayload,
    CreateBullMqWorkerOptions
  > = defaultWorkerFactory,
): WorkerLike {
  return workerFactory(
    queueName,
    async (job) => {
      await processor(job.data, job);
    },
    options,
  );
}

/**
 * Creates a worker that consumes task dispatch jobs.
 */
export function createTaskDispatchWorker(
  processor: WorkerProcessor<TaskDispatchJobPayload>,
  options: CreateBullMqWorkerOptions,
  workerFactory?: WorkerFactory<
    TaskDispatchJobPayload,
    CreateBullMqWorkerOptions
  >,
): WorkerLike {
  return createWorker(
    TASK_DISPATCH_QUEUE_NAME,
    processor,
    options,
    workerFactory,
  );
}

/**
 * Creates a worker that consumes schedule trigger jobs.
 */
export function createScheduleTriggerWorker(
  processor: WorkerProcessor<ScheduleTriggerJobPayload>,
  options: CreateBullMqWorkerOptions,
  workerFactory?: WorkerFactory<
    ScheduleTriggerJobPayload,
    CreateBullMqWorkerOptions
  >,
): WorkerLike {
  return createWorker(
    SCHEDULE_TRIGGER_QUEUE_NAME,
    processor,
    options,
    workerFactory,
  );
}
