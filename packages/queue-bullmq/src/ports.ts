/**
 * Minimal queue job record shape used by enqueue helpers and tests.
 */
export interface QueueJobLike<TPayload> {
  id?: string | null;
  name?: string;
  data: TPayload;
}

/**
 * Minimal queue interface required by enqueue helpers.
 */
export interface QueueLike<TPayload> {
  add(
    jobName: string,
    payload: TPayload,
    options?: unknown,
  ): Promise<QueueJobLike<TPayload>>;
}

/**
 * Minimal worker interface returned by worker factory helpers.
 */
export interface WorkerLike {
  close(force?: boolean): Promise<void>;
}

/**
 * Queue add options used internally before they are passed to BullMQ.
 */
export interface QueueJobOptions {
  attempts?: number;
  delay?: number;
  jobId?: string;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  repeat?: {
    pattern: string;
    tz?: string;
  };
}

/**
 * Generic delayed job options shared by queue enqueue helpers.
 */
export interface EnqueueJobOptions {
  attempts?: number;
  delayMs?: number;
  jobId?: string;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

/**
 * Repeat registration options for cron-based schedule trigger jobs.
 */
export interface RepeatableJobOptions {
  attempts?: number;
  cronExpression: string;
  jobId?: string;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  timezone?: string;
}

/**
 * Result returned by enqueue helpers after the queue accepts a job.
 */
export interface QueueJobRegistration<TPayload> {
  jobId?: string | null;
  jobName: string;
  options: QueueJobOptions;
  payload: TPayload;
}

/**
 * Worker processor signature used by worker creation helpers.
 */
export type WorkerProcessor<TPayload> = (
  payload: TPayload,
  job: QueueJobLike<TPayload>,
) => Promise<void> | void;

/**
 * Factory signature that allows tests to replace the concrete BullMQ Worker.
 */
export type WorkerFactory<TPayload, TWorkerOptions> = (
  queueName: string,
  processor: (job: QueueJobLike<TPayload>) => Promise<void>,
  options: TWorkerOptions,
) => WorkerLike;
