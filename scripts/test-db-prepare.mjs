#!/usr/bin/env node
/**
 * Prepare isolated test DB: load .env.test, migrate deploy, optional seed graph.
 *
 *   npm run test:db:prepare
 *
 * Requires TEST_DATABASE_URL pointing at a non-production database.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const envTest = resolve(root, ".env.test");

function loadEnvTest() {
  if (!existsSync(envTest)) {
    console.error("Missing .env.test — copy from .env.test.example first.");
    process.exit(1);
  }
  for (const raw of readFileSync(envTest, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvTest();

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL is empty in .env.test");
  process.exit(1);
}
if (/45\.88\.138\.18|production|darkcdn/i.test(url)) {
  console.error("Refusing to migrate — TEST_DATABASE_URL looks like production.");
  process.exit(1);
}

process.env.DATABASE_URL = url;

console.log("==> prisma migrate deploy (test DB)");
const migrate = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", "migrate", "deploy"],
  { cwd: root, env: process.env, stdio: "inherit", shell: process.platform === "win32" }
);
if (migrate.status !== 0) {
  console.error("migrate deploy failed");
  process.exit(migrate.status || 1);
}

console.log("==> test DB ready");
console.log(`DATABASE_URL=${url.replace(/:[^:@/]+@/, ":***@")}`);
