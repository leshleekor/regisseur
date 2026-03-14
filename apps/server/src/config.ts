import type { ServerConfig } from "./types.js";

const DEFAULT_SERVER_CONFIG: ServerConfig = {
  host: "127.0.0.1",
  port: 3000,
};

export function readServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const host = env.HOST?.trim() || DEFAULT_SERVER_CONFIG.host;
  const rawPort = env.PORT?.trim();

  if (!rawPort) {
    return {
      host,
      port: DEFAULT_SERVER_CONFIG.port,
    };
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return { host, port };
}

export function mergeServerConfig(
  overrides: Partial<ServerConfig> = {},
): ServerConfig {
  return {
    host: overrides.host ?? DEFAULT_SERVER_CONFIG.host,
    port: overrides.port ?? DEFAULT_SERVER_CONFIG.port,
  };
}
