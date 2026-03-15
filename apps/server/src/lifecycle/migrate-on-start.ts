import { runStorePostgresMigrations } from "@regisseur/store-postgres";

import type { BootstrapConfig, PostgresPoolLike } from "../types.js";

export async function migrateOnStart(
  config: Pick<BootstrapConfig, "autoMigrate">,
  pool: PostgresPoolLike,
  runMigrations: (
    pool: PostgresPoolLike,
  ) => Promise<void> = runStorePostgresMigrations,
): Promise<boolean> {
  if (!config.autoMigrate) {
    return false;
  }

  await runMigrations(pool);
  return true;
}
