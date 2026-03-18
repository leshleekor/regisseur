import { describe, expect, it, vi } from "vitest";

import { createWorkerResources } from "./create-worker-resources.js";

describe("createWorkerResources", () => {
  it("creates closeable worker resources with a required processor", async () => {
    const taskDispatchProcessor = vi.fn(async () => undefined);
    const scheduleTriggerProcessor = vi.fn(async () => undefined);
    const closeTaskWorker = vi.fn(async () => undefined);
    const closeScheduleWorker = vi.fn(async () => undefined);
    const createTaskDispatchWorkerImpl = vi.fn((processor) => {
      void processor({
        taskId: "task-1",
        workflowId: "workflow-1",
        triggerSource: "manual",
        requestedAt: "2026-03-15T00:00:00.000Z",
      });

      return {
        close: closeTaskWorker,
      };
    });
    const createScheduleTriggerWorkerImpl = vi.fn((processor) => {
      void processor({
        scheduleId: "schedule-1",
        targetType: "workflow",
        targetId: "workflow-1",
        triggeredAt: "2026-03-15T00:00:00.000Z",
      });

      return {
        close: closeScheduleWorker,
      };
    });
    const resources = createWorkerResources({
      connection: {
        host: "localhost",
        port: 6379,
      },
      taskDispatchProcessor,
      scheduleTriggerProcessor,
      createTaskDispatchWorkerImpl,
      createScheduleTriggerWorkerImpl,
    });

    expect(createTaskDispatchWorkerImpl).toHaveBeenCalledTimes(1);
    expect(createScheduleTriggerWorkerImpl).toHaveBeenCalledTimes(1);

    await resources.close();

    expect(closeTaskWorker).toHaveBeenCalledTimes(1);
    expect(closeScheduleWorker).toHaveBeenCalledTimes(1);
    expect(taskDispatchProcessor).toHaveBeenCalledWith({
      taskId: "task-1",
      workflowId: "workflow-1",
      triggerSource: "manual",
      requestedAt: "2026-03-15T00:00:00.000Z",
    });
    expect(scheduleTriggerProcessor).toHaveBeenCalledWith({
      scheduleId: "schedule-1",
      targetType: "workflow",
      targetId: "workflow-1",
      triggeredAt: "2026-03-15T00:00:00.000Z",
    });
  });
});
