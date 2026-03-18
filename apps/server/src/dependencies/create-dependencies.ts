import { createScheduleTriggerRegistrationPort } from "@regisseur/queue-bullmq";

import { createPostgresPool } from "@regisseur/store-postgres";

import { createServerDependencies } from "../plugins/repositories.js";
import type {
  BootstrapConfig,
  ExecutableAdapterRegistry,
  PostgresPoolLike,
  QueueResources,
  ServerDependencies,
  StandaloneServerComposition,
  WorkerResources,
} from "../types.js";
import type { CreateDispatchWorkerOptions } from "./create-dispatch-worker.js";
import { createDispatchWorker } from "./create-dispatch-worker.js";
import { createEnqueuePort } from "./create-enqueue-port.js";
import { createExecutableAdapterRegistry } from "./create-executable-adapter-registry.js";
import { createQueueResources } from "./create-queue-resources.js";
import { createRepositories } from "./create-repositories.js";

export interface CreateStandaloneDependenciesOptions {
  config: BootstrapConfig;
  pool?: PostgresPoolLike;
  queueResources?: QueueResources;
  workerResources?: WorkerResources;
  createPool?: (databaseUrl: string) => PostgresPoolLike;
  createQueueResources?: (config: BootstrapConfig) => QueueResources;
  createExecutableAdapterRegistry?: (
    config: BootstrapConfig,
  ) => ExecutableAdapterRegistry;
  createWorkerResources?: (
    options: CreateDispatchWorkerOptions,
  ) => WorkerResources;
}

export function createLoggerConfig(
  config: Pick<BootstrapConfig, "logLevel">,
): NonNullable<ServerDependencies["logger"]> {
  return {
    level: config.logLevel,
  };
}

export function createStandaloneServerDependencies(
  options: CreateStandaloneDependenciesOptions,
): StandaloneServerComposition {
  const pool =
    options.pool ??
    options.createPool?.(options.config.databaseUrl) ??
    createPostgresPool({
      connectionString: options.config.databaseUrl,
    });
  const repositories = createRepositories(pool);
  const queueResources =
    options.queueResources ??
    options.createQueueResources?.(options.config) ??
    createQueueResources({
      redisUrl: options.config.redisUrl,
    });
  const enqueuePort = createEnqueuePort({
    queue: queueResources.taskDispatchQueue,
  });
  const scheduleRegistrationPort = createScheduleTriggerRegistrationPort(
    queueResources.scheduleTriggerQueue,
  );
  const executableAdapterRegistry =
    options.createExecutableAdapterRegistry?.(options.config) ??
    createExecutableAdapterRegistry(options.config);
  const workerResources =
    options.workerResources ??
    options.createWorkerResources?.({
      connection: queueResources.connection,
      repositories,
      executableAdapterRegistry,
      enqueuePort,
    }) ??
    createDispatchWorker({
      connection: queueResources.connection,
      repositories,
      executableAdapterRegistry,
      enqueuePort,
    });
  const dependencies = createServerDependencies(
    repositories,
    enqueuePort,
    scheduleRegistrationPort,
    createLoggerConfig(options.config),
  );

  return {
    config: options.config,
    dependencies,
    repositories,
    enqueuePort,
    executableAdapterRegistry,
    pool,
    queueResources,
    workerResources,
  };
}
