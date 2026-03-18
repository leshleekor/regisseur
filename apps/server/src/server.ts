import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { bootstrapServer, type BootstrapServerOptions } from "./bootstrap.js";
import { mergeServerConfig, readServerConfig } from "./config.js";
import type { ServerConfig, ServerDependencies } from "./types.js";

export interface LegacyStartServerOptions {
  deps: Partial<ServerDependencies>;
  config?: Partial<ServerConfig>;
}

export type StartServerOptions =
  | LegacyStartServerOptions
  | BootstrapServerOptions;

export async function startServer(
  options: StartServerOptions = {},
): Promise<FastifyInstance> {
  if ("deps" in options && options.deps !== undefined) {
    const config = mergeServerConfig({
      ...readServerConfig(),
      ...options.config,
    });
    const app = buildApp(options.deps);

    await app.listen({
      host: config.host,
      port: config.port,
    });

    return app;
  }

  const bootstrap = await bootstrapServer(options as BootstrapServerOptions);

  try {
    await bootstrap.app.listen({
      host: bootstrap.config.server.host,
      port: bootstrap.config.server.port,
    });
  } catch (error) {
    bootstrap.unregisterSignalHandlers();
    await bootstrap.shutdown.shutdown();
    throw error;
  }

  return bootstrap.app;
}
