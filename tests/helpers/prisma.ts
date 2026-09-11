/**
 * Prisma client bound to TEST_DATABASE_URL / DATABASE_URL for integration tests.
 */
import { PrismaClient } from "@prisma/client";

let client: PrismaClient | null = null;

export function isSafeTestDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (/45\.88\.138\.18|85\.17\.162\.54|75\.119\.137\.174|production|darkcdn\.store/i.test(url)) {
    return false;
  }
  // Prefer explicit local / CI test databases
  if (/nexlify_test|_test\b|localhost|127\.0\.0\.1/i.test(url)) return true;
  // Allow other hosts only when explicitly opted in
  return process.env.NEXLIFY_TEST_ALLOW_REMOTE_DB === "1";
}

export function hasTestDatabase(): boolean {
  const url = process.env.TEST_DATABASE_URL;
  return isSafeTestDatabaseUrl(url);
}

export function getTestPrisma(): PrismaClient {
  if (!client) {
    const url = process.env.TEST_DATABASE_URL;
    if (!isSafeTestDatabaseUrl(url)) {
      throw new Error(
        "Safe TEST_DATABASE_URL required (local nexlify_test / localhost). Refusing DATABASE_URL fallback to avoid prod."
      );
    }
    client = new PrismaClient({
      datasources: { db: { url: url! } },
      log: process.env.NEXLIFY_TEST_PRISMA_LOG === "1" ? ["error", "warn"] : ["error"],
    });
  }
  return client;
}

export async function disconnectTestPrisma() {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

