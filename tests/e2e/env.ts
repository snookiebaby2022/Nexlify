/**
 * Load .env.test into process.env (does not override already-set keys unless force).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvTest(force = false) {
  const path = resolve(process.cwd(), ".env.test");
  if (!existsSync(path)) return false;
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
    if (force || process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}

export function assertSafeTestDatabaseUrl(url: string | undefined): asserts url is string {
  if (!url) throw new Error("TEST_DATABASE_URL is required for E2E");
  if (/45\.88\.138\.18|85\.17\.162\.54|75\.119\.137\.174|production|darkcdn/i.test(url)) {
    throw new Error("Refusing E2E against a production-looking DATABASE_URL");
  }
  if (
    !/nexlify_test|_test\b|localhost|127\.0\.0\.1/i.test(url) &&
    process.env.NEXLIFY_TEST_ALLOW_REMOTE_DB !== "1"
  ) {
    throw new Error("TEST_DATABASE_URL must look like a local/test DB (or set NEXLIFY_TEST_ALLOW_REMOTE_DB=1)");
  }
}
