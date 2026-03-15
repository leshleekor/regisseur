import { mergeServerConfig, readServerConfig } from "./config.js";
import type { BootstrapConfig, BootstrapConfigOverrides } from "./types.js";

const DEFAULT_AUTO_MIGRATE = false;
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_ENABLE_HTTP_ADAPTER = false;
const DEFAULT_ENABLE_CLI_ADAPTER = false;
const DEFAULT_ENABLE_OPENCLAW_ADAPTER = false;

function parseBooleanValue(
  rawValue: string | undefined,
  envName: string,
  defaultValue: boolean,
): boolean {
  const normalized = rawValue?.trim().toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`Invalid ${envName} value: ${rawValue}`);
}

function readRequiredValue(
  rawValue: string | undefined,
  envName: string,
): string {
  const value = rawValue?.trim();

  if (!value) {
    throw new Error(`Missing required ${envName} value`);
  }

  return value;
}

function coerceRequiredValue(
  value: string | undefined,
  envName: string,
): string {
  return readRequiredValue(value, envName);
}

export function loadServerConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: BootstrapConfigOverrides = {},
): BootstrapConfig {
  const server = mergeServerConfig({
    ...readServerConfig(env),
    ...overrides.server,
  });

  return {
    server,
    databaseUrl: coerceRequiredValue(
      overrides.databaseUrl ?? env.DATABASE_URL,
      "DATABASE_URL",
    ),
    redisUrl: coerceRequiredValue(
      overrides.redisUrl ?? env.REDIS_URL,
      "REDIS_URL",
    ),
    autoMigrate:
      overrides.autoMigrate ??
      parseBooleanValue(env.AUTO_MIGRATE, "AUTO_MIGRATE", DEFAULT_AUTO_MIGRATE),
    logLevel:
      (overrides.logLevel ?? env.LOG_LEVEL?.trim()) || DEFAULT_LOG_LEVEL,
    enableHttpAdapter:
      overrides.enableHttpAdapter ??
      parseBooleanValue(
        env.ENABLE_HTTP_ADAPTER,
        "ENABLE_HTTP_ADAPTER",
        DEFAULT_ENABLE_HTTP_ADAPTER,
      ),
    enableCliAdapter:
      overrides.enableCliAdapter ??
      parseBooleanValue(
        env.ENABLE_CLI_ADAPTER,
        "ENABLE_CLI_ADAPTER",
        DEFAULT_ENABLE_CLI_ADAPTER,
      ),
    enableOpenClawAdapter:
      overrides.enableOpenClawAdapter ??
      parseBooleanValue(
        env.ENABLE_OPENCLAW_ADAPTER,
        "ENABLE_OPENCLAW_ADAPTER",
        DEFAULT_ENABLE_OPENCLAW_ADAPTER,
      ),
  };
}
