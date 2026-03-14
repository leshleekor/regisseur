import { Pool } from "pg";
import type { PoolConfig } from "pg";

/**
 * Creates a PostgreSQL connection pool with externally supplied configuration.
 */
export function createPostgresPool(config: PoolConfig): Pool {
  return new Pool(config);
}
