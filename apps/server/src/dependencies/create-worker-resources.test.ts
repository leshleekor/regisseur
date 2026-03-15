import { describe, expect, it, vi } from "vitest";

import { createWorkerResources } from "./create-worker-resources.js";

describe("createWorkerResources", () => {
  it("creates closeable worker resources with a required processor", async () => {
    const taskDispatchProcessor = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const createTaskDispatchWorkerImpl = vi.fn((processor) => {
      void processor({
        taskId: "task-1",
        workflowId: "workflow-1",
        triggerSource: "manual",
        requestedAt: "2026-03-15T00:00:00.000Z",
      });

      return {
        close,
      };
    });
    const resources = createWorkerResources({
      connection: {
        host: "localhost",
        port: 6379,
      },
      taskDispatchProcessor,
      createTaskDispatchWorkerImpl,
    });

    expect(createTaskDispatchWorkerImpl).toHaveBeenCalledTimes(1);

    await resources.close();

    expect(close).toHaveBeenCalledTimes(1);
    expect(taskDispatchProcessor).toHaveBeenCalledWith({
      taskId: "task-1",
      workflowId: "workflow-1",
      triggerSource: "manual",
      requestedAt: "2026-03-15T00:00:00.000Z",
    });
  });
});
