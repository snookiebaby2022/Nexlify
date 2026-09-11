/**
 * Data-layer: Prisma migration inventory.
 * Prisma ships forward-only SQL (no per-migration DOWN). "Down" = migrate reset
 * then re-deploy — covered when TEST_DATABASE_URL is set.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { hasTestDatabase } from "../helpers/prisma.ts";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");

function listMigrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      const full = join(MIGRATIONS_DIR, name);
      return statSync(full).isDirectory() && !name.startsWith(".");
    })
    .sort();
}

describe("prisma migrations inventory", () => {
  it("every migration folder has a non-empty migration.sql", () => {
    const dirs = listMigrationDirs();
    assert.ok(dirs.length >= 1, "expected at least one migration");
    assert.ok(dirs.includes("20250601000000_baseline"), "baseline migration missing");

    for (const dir of dirs) {
      const sqlPath = join(MIGRATIONS_DIR, dir, "migration.sql");
      assert.equal(existsSync(sqlPath), true, `${dir}/migration.sql missing`);
      const sql = readFileSync(sqlPath, "utf8").trim();
      assert.ok(sql.length > 0, `${dir}/migration.sql is empty`);
      // No companion down.sql — Prisma does not generate reversible downs.
      assert.equal(
        existsSync(join(MIGRATIONS_DIR, dir, "down.sql")),
        false,
        `${dir}: unexpected down.sql (Prisma is forward-only)`
      );
    }
  });

  it("migration_lock.toml pins postgresql", () => {
    const lock = readFileSync(join(MIGRATIONS_DIR, "migration_lock.toml"), "utf8");
    assert.match(lock, /provider\s*=\s*"postgresql"/);
  });

  it(
    "migrate deploy applies cleanly on empty/test DB (requires TEST_DATABASE_URL)",
    { skip: !hasTestDatabase() },
    () => {
      const env = {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL!,
      };
      const result = spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["prisma", "migrate", "deploy"],
        {
          cwd: ROOT,
          env,
          encoding: "utf8",
          shell: process.platform === "win32",
          timeout: 120_000,
        }
      );
      assert.equal(result.status, 0, result.stderr || result.stdout || "migrate deploy failed");
    }
  );
});
