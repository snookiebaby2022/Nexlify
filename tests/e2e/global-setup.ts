import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvTest, assertSafeTestDatabaseUrl } from "./env";
import { seedE2eDatabase, SEED_PATH } from "./seed";

/**
 * Playwright globalSetup: require .env.test + safe TEST_DATABASE_URL, then seed.
 * Sets E2E_SKIP=1 when the DB is unavailable so specs can skip cleanly.
 */
export default async function globalSetup() {
  const hasEnv = loadEnvTest(true);
  const url = process.env.TEST_DATABASE_URL;
  if (!hasEnv || !url) {
    console.warn("[e2e] Missing .env.test / TEST_DATABASE_URL — specs will skip.");
    process.env.E2E_SKIP = "1";
    return;
  }
  try {
    assertSafeTestDatabaseUrl(url);
  } catch (err) {
    console.warn("[e2e]", err instanceof Error ? err.message : err);
    process.env.E2E_SKIP = "1";
    return;
  }

  process.env.DATABASE_URL = url;
  process.env.NEXLIFY_LICENSE_VALID = process.env.NEXLIFY_LICENSE_VALID || "1";
  process.env.NEXLIFY_TEST_MOCKS = "1";

  await seedE2eDatabase();
  if (!existsSync(SEED_PATH)) {
    throw new Error(`E2E seed did not write ${SEED_PATH}`);
  }
  console.log("[e2e] Seeded test DB →", resolve(SEED_PATH));
}
