import { readFile } from "node:fs/promises";

import type { Queryable } from "./types.js";

export const STORE_POSTGRES_MIGRATION_FILES = [
  new URL("./schema/migrations/001_init.sql", import.meta.url),
] as const;

/**
 * Applies the bundled idempotent store-postgres migrations in order.
 *
 * This is intentionally a minimal runner and not a full migration history
 * system.
 */
export async function runStorePostgresMigrations(db: Queryable): Promise<void> {
  for (const migrationFile of STORE_POSTGRES_MIGRATION_FILES) {
    const sql = await readFile(migrationFile, "utf8");
    await db.query(sql);
  }
}
