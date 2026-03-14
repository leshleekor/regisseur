import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { mergeServerConfig, readServerConfig } from "./config.js";
import type { ServerConfig, ServerDependencies } from "./types.js";

export interface StartServerOptions {
  deps: Partial<ServerDependencies>;
  config?: Partial<ServerConfig>;
}

export async function startServer(
  options: StartServerOptions,
): Promise<FastifyInstance> {
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
