import { describe, expect, it, vi } from "vitest";
import type { ProcessSignalBindingLike } from "./shutdown.js";

import {
  createShutdownController,
  registerShutdownHandlers,
} from "./shutdown.js";

describe("createShutdownController", () => {
  it("closes the app, pool, and queue resources", async () => {
    const resources = {
      app: {
        close: vi.fn(async () => undefined),
      },
      pool: {
        end: vi.fn(async () => undefined),
      },
      queueResources: {
        connection: {
          host: "localhost",
          port: 6379,
        },
        taskDispatchQueue: {
          add: vi.fn(),
          close: vi.fn(async () => undefined),
        },
        scheduleTriggerQueue: {
          add: vi.fn(),
          close: vi.fn(async () => undefined),
        },
        close: vi.fn(async () => undefined),
      },
    };

    const controller = createShutdownController(
      resources as Parameters<typeof createShutdownController>[0],
    );

    await controller.shutdown();

    expect(resources.app.close).toHaveBeenCalledTimes(1);
    expect(resources.pool.end).toHaveBeenCalledTimes(1);
    expect(resources.queueResources.close).toHaveBeenCalledTimes(1);
  });

  it("also closes worker resources when they are present", async () => {
    const resources = {
      app: {
        close: vi.fn(async () => undefined),
      },
      pool: {
        end: vi.fn(async () => undefined),
      },
      queueResources: {
        connection: {
          host: "localhost",
          port: 6379,
        },
        taskDispatchQueue: {
          add: vi.fn(),
          close: vi.fn(async () => undefined),
        },
        scheduleTriggerQueue: {
          add: vi.fn(),
          close: vi.fn(async () => undefined),
        },
        close: vi.fn(async () => undefined),
      },
      workerResources: {
        taskDispatchWorker: {
          close: vi.fn(async () => undefined),
        },
        scheduleTriggerWorker: {
          close: vi.fn(async () => undefined),
        },
        close: vi.fn(async () => undefined),
      },
    };
    const controller = createShutdownController(
      resources as Parameters<typeof createShutdownController>[0],
    );

    await controller.shutdown();

    expect(resources.workerResources.close).toHaveBeenCalledTimes(1);
  });

  it("is idempotent across repeated shutdown calls", async () => {
    const resources = {
      app: {
        close: vi.fn(async () => undefined),
      },
      pool: {
        end: vi.fn(async () => undefined),
      },
      queueResources: {
        connection: {
          host: "localhost",
          port: 6379,
        },
        taskDispatchQueue: {
          add: vi.fn(),
          close: vi.fn(async () => undefined),
        },
        scheduleTriggerQueue: {
          add: vi.fn(),
          close: vi.fn(async () => undefined),
        },
        close: vi.fn(async () => undefined),
      },
    };
    const controller = createShutdownController(
      resources as Parameters<typeof createShutdownController>[0],
    );

    await controller.shutdown();
    await controller.shutdown();

    expect(resources.app.close).toHaveBeenCalledTimes(1);
    expect(resources.pool.end).toHaveBeenCalledTimes(1);
    expect(resources.queueResources.close).toHaveBeenCalledTimes(1);
  });

  it("remains idempotent when worker resources are present", async () => {
    const resources = {
      app: {
        close: vi.fn(async () => undefined),
      },
      pool: {
        end: vi.fn(async () => undefined),
      },
      queueResources: {
        connection: {
          host: "localhost",
          port: 6379,
        },
        taskDispatchQueue: {
          add: vi.fn(),
          close: vi.fn(async () => undefined),
        },
        scheduleTriggerQueue: {
          add: vi.fn(),
          close: vi.fn(async () => undefined),
        },
        close: vi.fn(async () => undefined),
      },
      workerResources: {
        taskDispatchWorker: {
          close: vi.fn(async () => undefined),
        },
        scheduleTriggerWorker: {
          close: vi.fn(async () => undefined),
        },
        close: vi.fn(async () => undefined),
      },
    };
    const controller = createShutdownController(
      resources as Parameters<typeof createShutdownController>[0],
    );

    await controller.shutdown();
    await controller.shutdown();

    expect(resources.workerResources.close).toHaveBeenCalledTimes(1);
  });
});

describe("registerShutdownHandlers", () => {
  it("registers and unregisters SIGINT/SIGTERM handlers", () => {
    const listeners = new Map<string, () => void>();
    const processRef: ProcessSignalBindingLike = {
      once: vi.fn((event, listener) => {
        listeners.set(event, listener);
      }),
      off: vi.fn((event) => {
        listeners.delete(event);
      }),
    };
    const controller = {
      shutdown: vi.fn(async () => undefined),
    };

    const unregister = registerShutdownHandlers(controller, processRef);

    expect(processRef.once).toHaveBeenCalledTimes(2);
    expect(listeners.has("SIGINT")).toBe(true);
    expect(listeners.has("SIGTERM")).toBe(true);

    listeners.get("SIGINT")?.();
    expect(controller.shutdown).toHaveBeenCalledTimes(1);

    unregister();
    expect(processRef.off).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(0);
  });
});
