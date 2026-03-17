import type { BullMqConnectionConfig } from "@regisseur/queue-bullmq";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import type {
  ExecutableAdapterRegistry,
  ServerRepositories,
  WorkerResources,
} from "../types.js";
import { createTaskDispatchProcessor } from "../workers/dispatch-worker.js";
import { createScheduleTriggerProcessor } from "../workers/schedule-worker.js";
import {
  createWorkerResources,
  type CreateWorkerResourcesOptions,
} from "./create-worker-resources.js";

export interface CreateDispatchWorkerOptions {
  connection: BullMqConnectionConfig;
  repositories: ServerRepositories;
  executableAdapterRegistry: ExecutableAdapterRegistry;
  enqueuePort: DispatchEnqueuePort;
  createWorkerResourcesImpl?: (
    options: CreateWorkerResourcesOptions,
  ) => WorkerResources;
}

export function createDispatchWorker(
  options: CreateDispatchWorkerOptions,
): WorkerResources {
  const createWorkerResourcesImpl =
    options.createWorkerResourcesImpl ?? createWorkerResources;

  return createWorkerResourcesImpl({
    connection: options.connection,
    taskDispatchProcessor: createTaskDispatchProcessor({
      repositories: options.repositories,
      executableAdapterRegistry: options.executableAdapterRegistry,
      enqueuePort: options.enqueuePort,
    }),
    scheduleTriggerProcessor: createScheduleTriggerProcessor({
      repositories: {
        agentsRepository: options.repositories.agentsRepository,
        schedulesRepository: options.repositories.schedulesRepository,
        tasksRepository: options.repositories.tasksRepository,
        taskEdgesRepository: options.repositories.taskEdgesRepository,
        workflowsRepository: options.repositories.workflowsRepository,
        workflowDefinitionsRepository:
          options.repositories.workflowDefinitionsRepository,
        taskTemplatesRepository: options.repositories.taskTemplatesRepository,
        taskTemplateEdgesRepository:
          options.repositories.taskTemplateEdgesRepository,
        loopDefinitionsRepository:
          options.repositories.loopDefinitionsRepository,
      },
      enqueuePort: options.enqueuePort,
    }),
  });
}
