import {
  createTaskDispatchQueue,
  type BullMqConnectionConfig,
} from "@regisseur/queue-bullmq";

import type { QueueResources, TaskDispatchQueueLike } from "../types.js";

export interface CreateQueueResourcesOptions {
  redisUrl: string;
  createTaskDispatchQueueImpl?: (options: {
    connection: BullMqConnectionConfig;
  }) => TaskDispatchQueueLike;
}

function decodeRedisComponent(value: string): string | undefined {
  return value ? decodeURIComponent(value) : undefined;
}

export function createBullMqConnectionFromRedisUrl(
  redisUrl: string,
): BullMqConnectionConfig {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    throw new Error(`Invalid REDIS_URL value: ${redisUrl}`);
  }

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    throw new Error(`Invalid REDIS_URL protocol: ${parsedUrl.protocol}`);
  }

  if (!parsedUrl.hostname) {
    throw new Error("REDIS_URL must include a hostname");
  }

  const port = parsedUrl.port ? Number(parsedUrl.port) : 6379;

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid REDIS_URL port: ${parsedUrl.port}`);
  }

  const databasePath = parsedUrl.pathname.replace(/^\/+/, "");
  const connection: BullMqConnectionConfig = {
    host: parsedUrl.hostname,
    port,
  };

  if (databasePath) {
    const db = Number(databasePath);

    if (!Number.isInteger(db) || db < 0) {
      throw new Error(`Invalid REDIS_URL database: ${databasePath}`);
    }

    connection.db = db;
  }

  const username = decodeRedisComponent(parsedUrl.username);

  if (username) {
    connection.username = username;
  }

  const password = decodeRedisComponent(parsedUrl.password);

  if (password) {
    connection.password = password;
  }

  if (parsedUrl.protocol === "rediss:") {
    connection.tls = {};
  }

  return connection;
}

export function createQueueResources(
  options: CreateQueueResourcesOptions,
): QueueResources {
  const connection = createBullMqConnectionFromRedisUrl(options.redisUrl);
  const createTaskDispatchQueueImpl =
    options.createTaskDispatchQueueImpl ?? createTaskDispatchQueue;
  const taskDispatchQueue = createTaskDispatchQueueImpl({
    connection,
  });

  return {
    connection,
    taskDispatchQueue,
    async close() {
      await taskDispatchQueue.close();
    },
  };
}
