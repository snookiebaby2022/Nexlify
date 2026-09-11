/**
 * Load .env.test (if present) before any test file runs.
 * Only TEST_DATABASE_URL is used for DB tests — never silently reuse prod DATABASE_URL.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const envTest = resolve(root, ".env.test");

function applyEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

applyEnvFile(envTest);

if (process.env.TEST_DATABASE_URL) {
  const u = process.env.TEST_DATABASE_URL;
  if (/45\.88\.138\.18|85\.17\.162\.54|75\.119\.137\.174|darkcdn\.store/i.test(u)) {
    console.warn("[tests] Ignoring unsafe TEST_DATABASE_URL (looks like production).");
    delete process.env.TEST_DATABASE_URL;
  } else {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
}

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.NEXLIFY_TEST_MOCKS = process.env.NEXLIFY_TEST_MOCKS || "1";
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-jwt-secret-do-not-use-in-prod-32chars";
}
