import { Queue } from "bullmq";
import type { QueueOptions } from "bullmq";

import {
  SCHEDULE_TRIGGER_QUEUE_NAME,
  TASK_DISPATCH_QUEUE_NAME,
} from "./constants.js";
import type {
  ScheduleTriggerJobPayload,
  TaskDispatchJobPayload,
} from "./payloads.js";

/**
 * Redis connection shape accepted by BullMQ queue and worker constructors.
 */
export type BullMqConnectionConfig = NonNullable<QueueOptions["connection"]>;

/**
 * Common options for creating BullMQ queue instances.
 */
export interface CreateBullMqQueueOptions {
  connection: BullMqConnectionConfig;
  defaultJobOptions?: QueueOptions["defaultJobOptions"];
  prefix?: string;
}

/**
 * Creates a BullMQ queue with externally supplied Redis connection settings.
 */
export function createBullMqQueue<TPayload>(
  queueName: string,
  options: CreateBullMqQueueOptions,
): Queue<TPayload, void, string> {
  return new Queue<TPayload, void, string>(queueName, {
    connection: options.connection,
    defaultJobOptions: options.defaultJobOptions,
    prefix: options.prefix,
  });
}

/**
 * Creates the queue used to dispatch task execution requests.
 */
export function createTaskDispatchQueue(
  options: CreateBullMqQueueOptions,
): Queue<TaskDispatchJobPayload, void, string> {
  return createBullMqQueue<TaskDispatchJobPayload>(
    TASK_DISPATCH_QUEUE_NAME,
    options,
  );
}

/**
 * Creates the queue used to trigger schedules.
 */
export function createScheduleTriggerQueue(
  options: CreateBullMqQueueOptions,
): Queue<ScheduleTriggerJobPayload, void, string> {
  return createBullMqQueue<ScheduleTriggerJobPayload>(
    SCHEDULE_TRIGGER_QUEUE_NAME,
    options,
  );
}
