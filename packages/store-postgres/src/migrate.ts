import { access, readFile } from "node:fs/promises";

import type { Queryable } from "./types.js";

export const STORE_POSTGRES_MIGRATION_PATHS = [
  "./schema/migrations/001_init.sql",
] as const;

async function fileExists(fileUrl: URL): Promise<boolean> {
  try {
    await access(fileUrl);
    return true;
  } catch {
    return false;
  }
}

export async function resolveStorePostgresMigrationFile(
  migrationPath: (typeof STORE_POSTGRES_MIGRATION_PATHS)[number],
  moduleUrl: string | URL = import.meta.url,
): Promise<URL> {
  const bundledFileUrl = new URL(migrationPath, moduleUrl);

  if (await fileExists(bundledFileUrl)) {
    return bundledFileUrl;
  }

  const sourceFallbackUrl = new URL(
    `../src/${migrationPath.slice(2)}`,
    moduleUrl,
  );

  if (await fileExists(sourceFallbackUrl)) {
    return sourceFallbackUrl;
  }

  return bundledFileUrl;
}

export async function getStorePostgresMigrationFiles(
  moduleUrl: string | URL = import.meta.url,
): Promise<readonly URL[]> {
  return Promise.all(
    STORE_POSTGRES_MIGRATION_PATHS.map((migrationPath) =>
      resolveStorePostgresMigrationFile(migrationPath, moduleUrl),
    ),
  );
}

/**
 * Applies the bundled idempotent store-postgres migrations in order.
 *
 * This is intentionally a minimal runner and not a full migration history
 * system.
 */
export async function runStorePostgresMigrations(db: Queryable): Promise<void> {
  for (const migrationFile of await getStorePostgresMigrationFiles()) {
    const sql = await readFile(migrationFile, "utf8");
    await db.query(sql);
  }
}
