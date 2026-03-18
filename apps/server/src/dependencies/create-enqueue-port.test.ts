import { describe, expect, it, vi } from "vitest";
import {
  TASK_DISPATCH_JOB_NAME,
  type QueueLike,
  type TaskDispatchJobPayload,
} from "@regisseur/queue-bullmq";
import type { DispatchRequest } from "@regisseur/dispatcher";

import {
  createEnqueuePort,
  mapDispatchRequestToTaskDispatchJobPayload,
} from "./create-enqueue-port.js";

function createRequest(): DispatchRequest {
  return {
    taskId: "task-1",
    workflowId: "workflow-1",
    agentId: "agent-1",
    triggerSource: "schedule",
    requestedAt: "2026-03-15T00:00:00.000Z",
  };
}

function createQueue(): QueueLike<TaskDispatchJobPayload> & {
  add: ReturnType<typeof vi.fn>;
} {
  return {
    add: vi.fn(async (jobName: string, payload: TaskDispatchJobPayload) => ({
      id: "job-1",
      name: jobName,
      data: payload,
    })),
  };
}

describe("createEnqueuePort", () => {
  it("maps dispatch requests into queue payloads while dropping agentId", () => {
    const payload = mapDispatchRequestToTaskDispatchJobPayload(createRequest());

    expect(payload).toEqual({
      taskId: "task-1",
      workflowId: "workflow-1",
      triggerSource: "schedule",
      requestedAt: "2026-03-15T00:00:00.000Z",
    });
    expect("agentId" in payload).toBe(false);
  });

  it("wraps queue-bullmq enqueue with the dispatcher port shape", async () => {
    const queue = createQueue();
    const port = createEnqueuePort({
      queue,
    });

    await expect(port.enqueueTaskDispatch(createRequest())).resolves.toEqual({
      ok: true,
      jobId: "job-1",
    });
    expect(queue.add).toHaveBeenCalledWith(
      TASK_DISPATCH_JOB_NAME,
      {
        taskId: "task-1",
        workflowId: "workflow-1",
        triggerSource: "schedule",
        requestedAt: "2026-03-15T00:00:00.000Z",
      },
      {
        jobId: "task-1",
      },
    );
  });

  it("uses taskId as the temporary enqueue jobId idempotency key", async () => {
    const enqueueTaskDispatchImpl = vi.fn(async () => ({
      jobId: "task-1",
      jobName: TASK_DISPATCH_JOB_NAME,
      options: {
        jobId: "task-1",
      },
      payload: mapDispatchRequestToTaskDispatchJobPayload(createRequest()),
    }));
    const port = createEnqueuePort({
      queue: createQueue(),
      enqueueTaskDispatchImpl,
    });

    await port.enqueueTaskDispatch(createRequest());

    expect(enqueueTaskDispatchImpl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      {
        jobId: "task-1",
      },
    );
  });

  it("returns a structured enqueue failure when the queue rejects", async () => {
    const queue = createQueue();

    queue.add.mockRejectedValueOnce(new Error("redis unavailable"));

    const port = createEnqueuePort({
      queue,
    });

    await expect(port.enqueueTaskDispatch(createRequest())).resolves.toEqual({
      ok: false,
      message: "redis unavailable",
    });
  });

  it("fails early when the task dispatch queue is missing", () => {
    expect(() =>
      createEnqueuePort({
        queue: undefined as unknown as QueueLike<TaskDispatchJobPayload>,
      }),
    ).toThrow("Task dispatch queue is required to create enqueue port");
  });
});
