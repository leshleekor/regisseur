import type { FastifyInstance } from "fastify";
import type { BullMqConnectionConfig } from "@regisseur/queue-bullmq";

import { buildApp } from "./app.js";
import { createStandaloneServerDependencies } from "./dependencies/create-dependencies.js";
import { loadServerConfig } from "./env.js";
import { migrateOnStart } from "./lifecycle/migrate-on-start.js";
import {
  createShutdownController,
  registerShutdownHandlers,
} from "./lifecycle/shutdown.js";
import type {
  BootstrapConfigOverrides,
  BootstrapServerResult,
  PostgresPoolLike,
  QueueResources,
  ShutdownController,
  WorkerResources,
} from "./types.js";

export interface BootstrapFactories {
  createPool?: (databaseUrl: string) => PostgresPoolLike;
  createQueueResources?: (
    config: BootstrapServerResult["config"],
  ) => QueueResources;
  createWorkerResources?: (
    connection: BullMqConnectionConfig,
  ) => WorkerResources;
  runMigrations?: (pool: PostgresPoolLike) => Promise<void>;
  buildApp?: (deps: BootstrapServerResult["dependencies"]) => FastifyInstance;
  registerShutdownHandlers?: (controller: ShutdownController) => () => void;
}

export interface BootstrapServerOptions {
  env?: Record<string, string | undefined>;
  config?: BootstrapConfigOverrides;
  factories?: BootstrapFactories;
}

async function closeBootstrapResources(
  pool: PostgresPoolLike,
  queueResources: QueueResources,
  workerResources?: WorkerResources,
): Promise<void> {
  await Promise.allSettled([
    pool.end(),
    queueResources.close(),
    ...(workerResources ? [workerResources.close()] : []),
  ]);
}

export async function bootstrapServer(
  options: BootstrapServerOptions = {},
): Promise<BootstrapServerResult> {
  const config = loadServerConfig(options.env, options.config);
  const composition = createStandaloneServerDependencies({
    config,
    createPool: options.factories?.createPool,
    createQueueResources: options.factories?.createQueueResources,
    createWorkerResources: options.factories?.createWorkerResources,
  });

  try {
    await migrateOnStart(
      config,
      composition.pool,
      options.factories?.runMigrations,
    );

    const app = (options.factories?.buildApp ?? buildApp)(
      composition.dependencies,
    );
    const shutdown = createShutdownController({
      app,
      pool: composition.pool,
      queueResources: composition.queueResources,
      workerResources: composition.workerResources,
    });
    const unregisterSignalHandlers = (
      options.factories?.registerShutdownHandlers ?? registerShutdownHandlers
    )(shutdown);

    return {
      ...composition,
      app,
      shutdown,
      unregisterSignalHandlers,
    };
  } catch (error) {
    await closeBootstrapResources(
      composition.pool,
      composition.queueResources,
      composition.workerResources,
    );
    throw error;
  }
}
