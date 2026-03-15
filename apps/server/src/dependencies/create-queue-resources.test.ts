import { describe, expect, it, vi } from "vitest";

import {
  createBullMqConnectionFromRedisUrl,
  createQueueResources,
} from "./create-queue-resources.js";

describe("createBullMqConnectionFromRedisUrl", () => {
  it("parses redis URLs into BullMQ connection config", () => {
    expect(
      createBullMqConnectionFromRedisUrl("redis://user:pass@localhost:6380/2"),
    ).toEqual({
      host: "localhost",
      port: 6380,
      db: 2,
      username: "user",
      password: "pass",
    });
  });

  it("adds tls config for rediss URLs", () => {
    expect(
      createBullMqConnectionFromRedisUrl("rediss://localhost:6379"),
    ).toEqual({
      host: "localhost",
      port: 6379,
      tls: {},
    });
  });

  it("rejects unsupported redis URL protocols", () => {
    expect(() =>
      createBullMqConnectionFromRedisUrl("http://localhost:6379"),
    ).toThrow("Invalid REDIS_URL protocol: http:");
  });
});

describe("createQueueResources", () => {
  it("creates closeable queue resources from the supplied queue factory", async () => {
    const close = vi.fn(async () => undefined);
    const queue = {
      add: vi.fn(),
      close,
    };

    const resources = createQueueResources({
      redisUrl: "redis://localhost:6379/1",
      createTaskDispatchQueueImpl: vi.fn(() => queue),
    });

    expect(resources.connection).toEqual({
      host: "localhost",
      port: 6379,
      db: 1,
    });
    expect(resources.taskDispatchQueue).toBe(queue);

    await resources.close();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
