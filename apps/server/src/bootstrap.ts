import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { createStandaloneServerDependencies } from "./dependencies/create-dependencies.js";
import type { CreateDispatchWorkerOptions } from "./dependencies/create-dispatch-worker.js";
import { loadServerConfig } from "./env.js";
import { migrateOnStart } from "./lifecycle/migrate-on-start.js";
import { registerPersistedSchedulesOnStart } from "./schedules/registration.js";
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
  createExecutableAdapterRegistry?: NonNullable<
    Parameters<
      typeof createStandaloneServerDependencies
    >[0]["createExecutableAdapterRegistry"]
  >;
  createWorkerResources?: (
    options: CreateDispatchWorkerOptions,
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
    createExecutableAdapterRegistry:
      options.factories?.createExecutableAdapterRegistry,
    createWorkerResources: options.factories?.createWorkerResources,
  });

  try {
    await migrateOnStart(
      config,
      composition.pool,
      options.factories?.runMigrations,
    );
    if (composition.dependencies.scheduleRegistrationPort) {
      await registerPersistedSchedulesOnStart(
        composition.repositories.schedulesRepository,
        composition.dependencies.scheduleRegistrationPort,
      );
    }

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
