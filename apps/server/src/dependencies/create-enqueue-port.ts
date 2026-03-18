import type {
  DispatchEnqueuePort,
  DispatchRequest,
} from "@regisseur/dispatcher";
import {
  enqueueTaskDispatch,
  type QueueLike,
  type TaskDispatchJobPayload,
} from "@regisseur/queue-bullmq";

export interface CreateEnqueuePortOptions {
  queue: QueueLike<TaskDispatchJobPayload>;
  enqueueTaskDispatchImpl?: typeof enqueueTaskDispatch;
}

/**
 * The durable dispatch sequence is save task -> update workflow -> enqueue.
 * The queue payload intentionally omits agentId, so the execution worker must
 * recover the selected agent from persisted task.assigneeAgentId.
 */
export function mapDispatchRequestToTaskDispatchJobPayload(
  request: DispatchRequest,
): TaskDispatchJobPayload {
  return {
    taskId: request.taskId,
    workflowId: request.workflowId,
    triggerSource: request.triggerSource,
    requestedAt: request.requestedAt,
  };
}

export function createEnqueuePort(
  options: CreateEnqueuePortOptions,
): DispatchEnqueuePort {
  if (!options.queue) {
    throw new Error("Task dispatch queue is required to create enqueue port");
  }

  const enqueueTaskDispatchImpl =
    options.enqueueTaskDispatchImpl ?? enqueueTaskDispatch;

  return {
    async enqueueTaskDispatch(request) {
      try {
        // NOTE: jobId = taskId is a temporary deduplication policy for this
        // phase. It prevents duplicate enqueue on client retry after a save
        // failure.
        // LIMITATION: This blocks legitimate re-dispatch or retry of the same
        // task (for example after a failed execution). The retry/backoff
        // strategy will need a different jobId scheme such as taskId + attempt
        // once the execution lifecycle is implemented.
        const registration = await enqueueTaskDispatchImpl(
          options.queue,
          mapDispatchRequestToTaskDispatchJobPayload(request),
          { jobId: request.taskId },
        );

        return {
          ok: true,
          jobId: registration.jobId ?? undefined,
        };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : `Unknown enqueue failure for task ${request.taskId}`,
        };
      }
    },
  };
}
