import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { resolveStorePostgresMigrationFile } from "./migrate.js";

const TEMP_ROOTS: string[] = [];

async function createTempRoot(name: string): Promise<string> {
  const root = join(
    tmpdir(),
    `regisseur-store-postgres-migrate-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  TEMP_ROOTS.push(root);
  await mkdir(root, { recursive: true });

  return root;
}

afterEach(async () => {
  await Promise.all(
    TEMP_ROOTS.splice(0, TEMP_ROOTS.length).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("resolveStorePostgresMigrationFile", () => {
  it("prefers a bundled dist migration file when it exists", async () => {
    const root = await createTempRoot("dist");
    const distMigrateFile = join(root, "dist", "migrate.js");
    const bundledMigrationFile = join(
      root,
      "dist",
      "schema",
      "migrations",
      "001_init.sql",
    );

    await mkdir(join(root, "dist", "schema", "migrations"), {
      recursive: true,
    });
    await writeFile(distMigrateFile, "", "utf8");
    await writeFile(bundledMigrationFile, "-- bundled", "utf8");

    const resolved = await resolveStorePostgresMigrationFile(
      "./schema/migrations/001_init.sql",
      pathToFileURL(distMigrateFile),
    );

    expect(resolved).toEqual(pathToFileURL(bundledMigrationFile));
  });

  it("falls back to the source migration file when dist assets are missing", async () => {
    const root = await createTempRoot("src-fallback");
    const distMigrateFile = join(root, "dist", "migrate.js");
    const sourceMigrationFile = join(
      root,
      "src",
      "schema",
      "migrations",
      "001_init.sql",
    );

    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(root, "src", "schema", "migrations"), {
      recursive: true,
    });
    await writeFile(distMigrateFile, "", "utf8");
    await writeFile(sourceMigrationFile, "-- source", "utf8");

    const resolved = await resolveStorePostgresMigrationFile(
      "./schema/migrations/001_init.sql",
      pathToFileURL(distMigrateFile),
    );

    expect(resolved).toEqual(pathToFileURL(sourceMigrationFile));
  });
});
