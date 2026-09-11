/**
 * Concurrent debitResellerCredits race (no HTTP).
 * Proves updateMany WHERE credits >= amount cannot double-spend.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { debitResellerCredits } from "../../src/lib/reseller-credit-charge";
import { loadEnvTest, assertSafeTestDatabaseUrl } from "./env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, ".fixtures.json");

const CONCURRENCY = Number(process.env.LOAD_CREDIT_RACE_N || 200);
const START = Number(process.env.LOAD_RESELLER_CREDITS || 100);
const AMOUNT = 1;

async function main() {
  loadEnvTest(true);
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assertSafeTestDatabaseUrl(url);
  process.env.DATABASE_URL = url;

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  let resellerId: string | undefined;
  if (existsSync(FIXTURES)) {
    const f = JSON.parse(readFileSync(FIXTURES, "utf8"));
    resellerId = f.resellerId;
  } else {
    const u = await prisma.panelUser.findFirst({
      where: { username: "load_reseller" },
      select: { id: true },
    });
    resellerId = u?.id;
  }
  if (!resellerId) {
    throw new Error("load_reseller not found — run npm run test:load:seed first");
  }

  await prisma.panelUser.update({
    where: { id: resellerId },
    data: { credits: START },
  });
  await prisma.creditTransaction.deleteMany({
    where: { userId: resellerId, note: { startsWith: "load-race:" } },
  });

  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      prisma
        .$transaction((tx) =>
          debitResellerCredits(tx, {
            userId: resellerId!,
            amount: AMOUNT,
            note: `load-race:${i}`,
          })
        )
        .then((r) => ({ ok: true as const, ...r }))
        .catch((e) => ({
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        }))
    )
  );

  const elapsedMs = Date.now() - t0;
  const successes = results.filter((r) => r.ok);
  const fails = results.filter((r) => !r.ok);
  const after = await prisma.panelUser.findUniqueOrThrow({
    where: { id: resellerId },
    select: { credits: true },
  });
  const ledger = await prisma.creditTransaction.aggregate({
    where: { userId: resellerId, note: { startsWith: "load-race:" } },
    _sum: { amount: true },
    _count: true,
  });

  const spent = successes.reduce((s, r) => s + ("charged" in r ? r.charged : 0), 0);
  const report = {
    concurrency: CONCURRENCY,
    startCredits: START,
    amountEach: AMOUNT,
    successes: successes.length,
    failures: fails.length,
    finalCredits: after.credits,
    spent,
    ledgerSum: ledger._sum.amount,
    ledgerCount: ledger._count,
    elapsedMs,
    throughputDebitsPerSec: Number((successes.length / (elapsedMs / 1000)).toFixed(2)),
    doubleSpend: after.credits < 0 || spent > START || successes.length > START,
    allFailuresAreInsufficient: fails.every(
      (f) => "error" in f && /Insufficient credits/i.test(f.error || "")
    ),
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();

  if (report.doubleSpend) {
    console.error("FAIL: double-spend or negative balance detected");
    process.exit(1);
  }
  if (successes.length !== START) {
    console.error(`FAIL: expected exactly ${START} successes, got ${successes.length}`);
    process.exit(1);
  }
  if (after.credits !== 0) {
    console.error(`FAIL: expected final credits 0, got ${after.credits}`);
    process.exit(1);
  }
  if (!report.allFailuresAreInsufficient) {
    console.error("FAIL: unexpected error among failed debits");
    process.exit(1);
  }
  console.log("PASS: no double-spend under concurrent debitResellerCredits");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
