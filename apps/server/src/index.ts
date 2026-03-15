import { pathToFileURL } from "node:url";

import { startServer } from "./server.js";

export const PACKAGE_NAME = "server";

export * from "./app.js";
export * from "./bootstrap.js";
export * from "./config.js";
export * from "./dependencies/create-adapter-registry.js";
export * from "./dependencies/create-dependencies.js";
export * from "./dependencies/create-dispatcher.js";
export * from "./dependencies/create-enqueue-port.js";
export * from "./dependencies/create-queue-resources.js";
export * from "./dependencies/create-repositories.js";
export * from "./dependencies/create-worker-resources.js";
export * from "./env.js";
export * from "./errors/error-handler.js";
export * from "./errors/http-error.js";
export * from "./errors/pg-error.js";
export * from "./lifecycle/migrate-on-start.js";
export * from "./lifecycle/shutdown.js";
export * from "./plugins/dispatcher.js";
export * from "./plugins/repositories.js";
export * from "./server.js";
export * from "./types.js";

function isMainModule(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  void startServer().catch((error) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : error;

    console.error(message);
    process.exitCode = 1;
  });
}
