import {
  SCHEDULE_TRIGGER_JOB_NAME,
  TASK_DISPATCH_JOB_NAME,
} from "./constants.js";
import type {
  ScheduleTriggerJobPayload,
  TaskDispatchJobPayload,
} from "./payloads.js";
import type {
  EnqueueJobOptions,
  QueueJobOptions,
  QueueJobRegistration,
  QueueLike,
  RepeatableJobOptions,
} from "./ports.js";

function toQueueJobOptions(options?: EnqueueJobOptions): QueueJobOptions {
  if (!options) {
    return {};
  }

  return {
    attempts: options.attempts,
    delay: options.delayMs,
    jobId: options.jobId,
    removeOnComplete: options.removeOnComplete,
    removeOnFail: options.removeOnFail,
  };
}

function toRepeatableQueueJobOptions(
  options: RepeatableJobOptions,
): QueueJobOptions {
  return {
    attempts: options.attempts,
    jobId: options.jobId,
    removeOnComplete: options.removeOnComplete,
    removeOnFail: options.removeOnFail,
    repeat: {
      pattern: options.cronExpression,
      tz: options.timezone,
    },
  };
}

/**
 * Enqueues a task dispatch job onto a queue-like object.
 */
export async function enqueueTaskDispatch(
  queue: QueueLike<TaskDispatchJobPayload>,
  payload: TaskDispatchJobPayload,
  options?: EnqueueJobOptions,
): Promise<QueueJobRegistration<TaskDispatchJobPayload>> {
  const queueOptions = toQueueJobOptions(options);
  const job = await queue.add(TASK_DISPATCH_JOB_NAME, payload, queueOptions);

  return {
    jobId: job.id,
    jobName: TASK_DISPATCH_JOB_NAME,
    options: queueOptions,
    payload,
  };
}

/**
 * Enqueues a schedule trigger job onto a queue-like object.
 */
export async function enqueueScheduleTrigger(
  queue: QueueLike<ScheduleTriggerJobPayload>,
  payload: ScheduleTriggerJobPayload,
  options?: EnqueueJobOptions,
): Promise<QueueJobRegistration<ScheduleTriggerJobPayload>> {
  const queueOptions = toQueueJobOptions(options);
  const job = await queue.add(SCHEDULE_TRIGGER_JOB_NAME, payload, queueOptions);

  return {
    jobId: job.id,
    jobName: SCHEDULE_TRIGGER_JOB_NAME,
    options: queueOptions,
    payload,
  };
}

/**
 * Registers a repeatable cron schedule trigger on a queue-like object.
 */
export async function registerCronScheduleTrigger(
  queue: QueueLike<ScheduleTriggerJobPayload>,
  payload: ScheduleTriggerJobPayload,
  options: RepeatableJobOptions,
): Promise<QueueJobRegistration<ScheduleTriggerJobPayload>> {
  const queueOptions = toRepeatableQueueJobOptions(options);
  const job = await queue.add(SCHEDULE_TRIGGER_JOB_NAME, payload, queueOptions);

  return {
    jobId: job.id,
    jobName: SCHEDULE_TRIGGER_JOB_NAME,
    options: queueOptions,
    payload,
  };
}

/**
 * Creates a scheduler-compatible port backed by the supplied BullMQ queue.
 */
export function createScheduleTriggerRegistrationPort(
  queue: QueueLike<ScheduleTriggerJobPayload>,
) {
  return {
    enqueueScheduleTrigger: (
      payload: ScheduleTriggerJobPayload,
      options?: EnqueueJobOptions,
    ) => enqueueScheduleTrigger(queue, payload, options),
    registerCronScheduleTrigger: (
      payload: ScheduleTriggerJobPayload,
      options: RepeatableJobOptions,
    ) => registerCronScheduleTrigger(queue, payload, options),
  };
}
