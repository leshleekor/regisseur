import { createPostgresPool } from "@regisseur/store-postgres";
import type { BullMqConnectionConfig } from "@regisseur/queue-bullmq";

import { createServerDependencies } from "../plugins/repositories.js";
import type {
  BootstrapConfig,
  PostgresPoolLike,
  QueueResources,
  ServerDependencies,
  StandaloneServerComposition,
  WorkerResources,
} from "../types.js";
import { createAdapterRegistry } from "./create-adapter-registry.js";
import { createDispatcher } from "./create-dispatcher.js";
import { createEnqueuePort } from "./create-enqueue-port.js";
import { createQueueResources } from "./create-queue-resources.js";
import { createRepositories } from "./create-repositories.js";

export interface CreateStandaloneDependenciesOptions {
  config: BootstrapConfig;
  pool?: PostgresPoolLike;
  queueResources?: QueueResources;
  workerResources?: WorkerResources;
  createPool?: (databaseUrl: string) => PostgresPoolLike;
  createQueueResources?: (config: BootstrapConfig) => QueueResources;
  createWorkerResources?: (
    connection: BullMqConnectionConfig,
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
  // workerResources is intentionally undefined by default.
  // It is only created when a real processor factory is injected.
  const workerResources =
    options.workerResources ??
    options.createWorkerResources?.(queueResources.connection);
  const enqueuePort = createEnqueuePort({
    queue: queueResources.taskDispatchQueue,
  });
  const dispatcher = createDispatcher(enqueuePort);
  const adapterRegistry = createAdapterRegistry(options.config);
  const dependencies = createServerDependencies(
    repositories,
    dispatcher,
    createLoggerConfig(options.config),
  );

  return {
    config: options.config,
    dependencies,
    repositories,
    dispatcher,
    enqueuePort,
    adapterRegistry,
    pool,
    queueResources,
    workerResources,
  };
}
