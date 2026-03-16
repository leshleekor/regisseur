import { describe, expect, it, vi } from "vitest";

import { createDispatchWorker } from "./create-dispatch-worker.js";

describe("createDispatchWorker", () => {
  it("binds repositories, adapter registry, and enqueue port into worker resources", () => {
    const createWorkerResourcesImpl = vi.fn(() => ({
      taskDispatchWorker: {
        close: vi.fn(async () => undefined),
      },
      scheduleTriggerWorker: {
        close: vi.fn(async () => undefined),
      },
      close: vi.fn(async () => undefined),
    }));

    const workerResources = createDispatchWorker({
      connection: {
        host: "localhost",
        port: 6379,
      },
      repositories: {
        agentsRepository: {} as never,
        workflowsRepository: {} as never,
        tasksRepository: {} as never,
        taskEdgesRepository: {} as never,
        workflowDefinitionsRepository: {} as never,
        taskTemplatesRepository: {} as never,
        taskTemplateEdgesRepository: {} as never,
        schedulesRepository: {} as never,
        runsRepository: {} as never,
      },
      executableAdapterRegistry: {},
      enqueuePort: {
        enqueueTaskDispatch: vi.fn(async () => ({
          ok: true as const,
          jobId: "job-1",
        })),
      },
      createWorkerResourcesImpl,
    });

    expect(createWorkerResourcesImpl).toHaveBeenCalledTimes(1);
    expect(createWorkerResourcesImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: {
          host: "localhost",
          port: 6379,
        },
        taskDispatchProcessor: expect.any(Function),
        scheduleTriggerProcessor: expect.any(Function),
      }),
    );
    expect(workerResources.taskDispatchWorker).toBeDefined();
    expect(workerResources.scheduleTriggerWorker).toBeDefined();
  });
});
