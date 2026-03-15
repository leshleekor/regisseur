import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const legacyListen = vi.fn(async () => undefined);
  const standaloneListen = vi.fn(async () => undefined);
  const legacyApp = {
    listen: legacyListen,
  } as unknown as FastifyInstance;
  const standaloneApp = {
    listen: standaloneListen,
  } as unknown as FastifyInstance;
  const buildApp = vi.fn(() => legacyApp);
  const shutdown = {
    shutdown: vi.fn(async () => undefined),
  };
  const unregisterSignalHandlers = vi.fn();
  const bootstrapServer = vi.fn(async () => ({
    app: standaloneApp,
    config: {
      server: {
        host: "0.0.0.0",
        port: 3000,
      },
    },
    shutdown,
    unregisterSignalHandlers,
  }));

  return {
    legacyApp,
    standaloneApp,
    buildApp,
    legacyListen,
    standaloneListen,
    shutdown,
    unregisterSignalHandlers,
    bootstrapServer,
  };
});

vi.mock("./app.js", () => ({
  buildApp: mocked.buildApp,
}));

vi.mock("./bootstrap.js", () => ({
  bootstrapServer: mocked.bootstrapServer,
}));

import { startServer } from "./server.js";

describe("startServer", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses HOST and PORT from the environment when explicit config is omitted", async () => {
    vi.stubEnv("HOST", "0.0.0.0");
    vi.stubEnv("PORT", "4321");

    const app = await startServer({
      deps: {},
    });

    expect(app).toBe(mocked.legacyApp);
    expect(mocked.buildApp).toHaveBeenCalledWith({});
    expect(mocked.legacyListen).toHaveBeenCalledWith({
      host: "0.0.0.0",
      port: 4321,
    });
  });

  it("lets explicit config override environment-derived defaults", async () => {
    vi.stubEnv("HOST", "0.0.0.0");
    vi.stubEnv("PORT", "4321");

    await startServer({
      deps: {},
      config: {
        host: "127.0.0.1",
        port: 9999,
      },
    });

    expect(mocked.legacyListen).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 9999,
    });
  });

  it("fails early when PORT is invalid", async () => {
    vi.stubEnv("PORT", "invalid");

    await expect(
      startServer({
        deps: {},
      }),
    ).rejects.toThrow("Invalid PORT value: invalid");
    expect(mocked.buildApp).not.toHaveBeenCalled();
  });

  it("uses the standalone bootstrap path when deps are omitted", async () => {
    const app = await startServer();

    expect(app).toBe(mocked.standaloneApp);
    expect(mocked.bootstrapServer).toHaveBeenCalledWith({});
    expect(mocked.standaloneListen).toHaveBeenCalledWith({
      host: "0.0.0.0",
      port: 3000,
    });
  });

  it("shuts down standalone resources when listen fails", async () => {
    mocked.standaloneListen.mockRejectedValueOnce(new Error("listen failed"));

    await expect(startServer()).rejects.toThrow("listen failed");
    expect(mocked.unregisterSignalHandlers).toHaveBeenCalledTimes(1);
    expect(mocked.shutdown.shutdown).toHaveBeenCalledTimes(1);
  });
});
