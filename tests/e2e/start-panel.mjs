/**
 * Start Next.js against TEST_DATABASE_URL on a dedicated E2E port.
 * Spawns `next` directly (not run-next.mjs) so PORT / DATABASE_URL are not
 * overwritten by the developer's production .env.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadFile(path, { override = false } = {}) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
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
    if (override || process.env[key] === undefined) process.env[key] = val;
  }
}

const root = process.cwd();
// Base secrets from .env (JWT etc.), then force test DB from .env.test
loadFile(resolve(root, ".env"), { override: false });
loadFile(resolve(root, ".env.test"), { override: true });

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL required in .env.test");
  process.exit(1);
}
if (/45\.88\.138\.18|production|darkcdn/i.test(url)) {
  console.error("Refusing production-looking TEST_DATABASE_URL");
  process.exit(1);
}

const port = process.env.E2E_PORT || "13100";
process.env.DATABASE_URL = url;
process.env.PORT = port;
process.env.PANEL_PORT = port;
process.env.NEXLIFY_LICENSE_VALID = "1";
process.env.NEXLIFY_TEST_MOCKS = "1";
process.env.PANEL_BIND_HOST = "127.0.0.1";
delete process.env.PANEL_FORCE_HTTPS;
delete process.env.PANEL_FULL_SSL;
delete process.env.PANEL_PRIMARY_DOMAIN;

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "e2e-test-jwt-secret-change-me-32chars";
}

const nextBin = resolve(root, "node_modules/next/dist/bin/next");
console.log(`[e2e] Starting panel on http://127.0.0.1:${port} (DATABASE_URL=test)`);

const child = spawn(
  process.execPath,
  [nextBin, "dev", "--hostname", "127.0.0.1", "-p", port],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }
);

child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
