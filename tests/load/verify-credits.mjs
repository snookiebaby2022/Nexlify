/**
 * After credit k6 scenario: assert reseller balance never went negative
 * and successes cannot exceed starting credits.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvTest, assertSafeTestDatabaseUrl } from "./env.mjs";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  loadEnvTest(true);
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assertSafeTestDatabaseUrl(url);

  const fixturesPath = resolve(__dirname, ".fixtures.json");
  if (!existsSync(fixturesPath)) throw new Error("Missing .fixtures.json — seed first");
  const f = JSON.parse(readFileSync(fixturesPath, "utf8"));
  const start = Number(f.resellerCredits ?? 100);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const user = await prisma.panelUser.findUniqueOrThrow({
    where: { id: f.resellerId },
    select: { credits: true, username: true },
  });
  const lines = await prisma.line.count({
    where: { ownerId: f.resellerId, username: { startsWith: "load_race_" } },
  });
  const ledger = await prisma.creditTransaction.aggregate({
    where: { userId: f.resellerId, amount: { lt: 0 } },
    _sum: { amount: true },
  });

  const report = {
    username: user.username,
    startCredits: start,
    finalCredits: user.credits,
    raceLinesCreated: lines,
    negativeLedgerSum: ledger._sum.amount,
    ok:
      user.credits >= 0 &&
      lines <= start &&
      user.credits === start - lines * Number(f.packageCreditCost || 1),
  };
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  if (!report.ok) {
    console.error("FAIL: credit invariant broken after HTTP race");
    process.exit(1);
  }
  console.log("PASS: HTTP credit race invariants hold");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
