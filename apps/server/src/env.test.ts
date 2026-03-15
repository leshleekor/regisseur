import { describe, expect, it } from "vitest";

import { loadServerConfig } from "./env.js";

describe("loadServerConfig", () => {
  it("applies standalone defaults when optional env is omitted", () => {
    const config = loadServerConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/regisseur",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(config).toEqual({
      server: {
        host: "0.0.0.0",
        port: 3000,
      },
      databaseUrl: "postgres://postgres:postgres@localhost:5432/regisseur",
      redisUrl: "redis://localhost:6379",
      autoMigrate: false,
      logLevel: "info",
      enableHttpAdapter: false,
      enableCliAdapter: false,
      enableOpenClawAdapter: false,
    });
  });

  it("fails when DATABASE_URL is missing", () => {
    expect(() =>
      loadServerConfig({
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow("Missing required DATABASE_URL value");
  });

  it("fails when REDIS_URL is missing", () => {
    expect(() =>
      loadServerConfig({
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/regisseur",
      }),
    ).toThrow("Missing required REDIS_URL value");
  });

  it("fails when PORT is invalid", () => {
    expect(() =>
      loadServerConfig({
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/regisseur",
        REDIS_URL: "redis://localhost:6379",
        PORT: "abc",
      }),
    ).toThrow("Invalid PORT value: abc");
  });

  it("parses AUTO_MIGRATE values", () => {
    expect(
      loadServerConfig({
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/regisseur",
        REDIS_URL: "redis://localhost:6379",
        AUTO_MIGRATE: "true",
      }).autoMigrate,
    ).toBe(true);

    expect(
      loadServerConfig({
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/regisseur",
        REDIS_URL: "redis://localhost:6379",
        AUTO_MIGRATE: "false",
      }).autoMigrate,
    ).toBe(false);
  });

  it("parses adapter enable flags", () => {
    const config = loadServerConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/regisseur",
      REDIS_URL: "redis://localhost:6379",
      ENABLE_HTTP_ADAPTER: "true",
      ENABLE_CLI_ADAPTER: "true",
      ENABLE_OPENCLAW_ADAPTER: "false",
    });

    expect(config.enableHttpAdapter).toBe(true);
    expect(config.enableCliAdapter).toBe(true);
    expect(config.enableOpenClawAdapter).toBe(false);
  });

  it("lets explicit overrides win over env values", () => {
    const config = loadServerConfig(
      {
        DATABASE_URL: "postgres://env/env",
        REDIS_URL: "redis://env",
        PORT: "3333",
      },
      {
        databaseUrl: "postgres://override/override",
        redisUrl: "redis://override",
        server: {
          port: 4444,
        },
      },
    );

    expect(config.databaseUrl).toBe("postgres://override/override");
    expect(config.redisUrl).toBe("redis://override");
    expect(config.server.port).toBe(4444);
  });
});
