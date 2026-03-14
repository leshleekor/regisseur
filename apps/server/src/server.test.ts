import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const listen = vi.fn(async () => undefined);
  const app = {
    listen,
  } as unknown as FastifyInstance;
  const buildApp = vi.fn(() => app);

  return {
    app,
    buildApp,
    listen,
  };
});

vi.mock("./app.js", () => ({
  buildApp: mocked.buildApp,
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

    expect(app).toBe(mocked.app);
    expect(mocked.buildApp).toHaveBeenCalledWith({});
    expect(mocked.listen).toHaveBeenCalledWith({
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

    expect(mocked.listen).toHaveBeenCalledWith({
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
});
