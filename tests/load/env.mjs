/**
 * Shared env helpers for load seed / report / credit-race (Node only).
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

export function assertSafeTestDatabaseUrl(url) {
  if (!url) throw new Error("TEST_DATABASE_URL is required for load tests");
  if (/45\.88\.138\.18|85\.17\.162\.54|75\.119\.137\.174|production|darkcdn/i.test(url)) {
    throw new Error("Refusing load tests against a production-looking DATABASE_URL");
  }
  if (
    !/nexlify_test|_test\b|localhost|127\.0\.0\.1|staging/i.test(url) &&
    process.env.NEXLIFY_TEST_ALLOW_REMOTE_DB !== "1"
  ) {
    throw new Error(
      "TEST_DATABASE_URL must look like a local/test/staging DB (or set NEXLIFY_TEST_ALLOW_REMOTE_DB=1)"
    );
  }
}

export function assertSafeLoadBaseUrl(url) {
  if (!url) throw new Error("LOAD_BASE_URL is required");
  if (/45\.88\.138\.18|darkcdn|production/i.test(url)) {
    throw new Error("Refusing LOAD_BASE_URL that looks like production 45 / darkcdn");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid LOAD_BASE_URL: ${url}`);
  }
  if (
    !/localhost|127\.0\.0\.1|staging|\.local$/i.test(parsed.hostname) &&
    process.env.NEXLIFY_LOAD_ALLOW_REMOTE !== "1"
  ) {
    throw new Error(
      "LOAD_BASE_URL must be localhost/staging (or set NEXLIFY_LOAD_ALLOW_REMOTE=1 for a dedicated staging host)"
    );
  }
}
