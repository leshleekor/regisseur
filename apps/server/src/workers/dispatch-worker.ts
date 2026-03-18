import type { TaskDispatchJobPayload } from "@regisseur/queue-bullmq";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import type {
  ExecutableAdapterRegistry,
  ServerRepositories,
} from "../types.js";
import {
  executeTaskLifecycle,
  type ExecuteTaskLifecycleOptions,
} from "../execution/execution-service.js";

export interface CreateTaskDispatchProcessorOptions extends ExecuteTaskLifecycleOptions {
  repositories: ServerRepositories;
  executableAdapterRegistry: ExecutableAdapterRegistry;
  enqueuePort: DispatchEnqueuePort;
}

export function createTaskDispatchProcessor(
  options: CreateTaskDispatchProcessorOptions,
): (payload: TaskDispatchJobPayload) => Promise<void> {
  return async (payload) => {
    const result = await executeTaskLifecycle(
      payload,
      options.repositories,
      options.executableAdapterRegistry,
      options.enqueuePort,
      options,
    );

    if (!result.ok) {
      throw new Error(result.message);
    }
  };
}
