#!/usr/bin/env node
/**
 * Fast live URL dedupe — SQL window function, batched DELETE (commits per batch).
 * Much faster than Prisma; avoids one giant lock vs live traffic.
 * Usage: node scripts/purge-live-url-duplicates-sql.cjs [--dry-run] [--batch=3000]
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const LOG = process.env.PURGE_LOG || "/var/log/nexlify-purge-live-dup.log";
const dryRun = process.argv.includes("--dry-run");
const batchArg = process.argv.find((a) => a.startsWith("--batch="));
const BATCH = Number(batchArg?.split("=")[1] || process.env.PURGE_SQL_BATCH || 3000);

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG, line);
  } catch {
    /* ignore */
  }
}

const URL_KEY = `lower(regexp_replace(trim(s."streamUrl"), '/+$', ''))`;

const LIVE_CTE = `
WITH live AS (
  SELECT s.id, ${URL_KEY} AS url_key, s."createdAt",
    COALESCE(bs.cnt, 0)::int AS bouquet_cnt
  FROM "Stream" s
  LEFT JOIN (
    SELECT "streamId", COUNT(*)::int AS cnt FROM "BouquetStream" GROUP BY "streamId"
  ) bs ON bs."streamId" = s.id
  WHERE s.type = 'LIVE' AND s."isRadio" = false AND trim(s."streamUrl") <> ''
),
ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY url_key
      ORDER BY bouquet_cnt DESC, "createdAt" ASC, id ASC
    ) AS rn
  FROM live
)`;

const COUNT_SQL = `
${LIVE_CTE}
SELECT
  (SELECT COUNT(*) FROM live) AS scanned,
  (SELECT COUNT(*) FROM ranked WHERE rn > 1) AS to_delete,
  (SELECT COUNT(DISTINCT url_key) FROM live WHERE url_key <> '') AS url_groups
`;

function deleteBatchSql(limit) {
  return `
${LIVE_CTE},
dupes AS (
  SELECT id FROM ranked WHERE rn > 1 LIMIT ${limit}
)
DELETE FROM "Stream" s
USING dupes d
WHERE s.id = d.id
`;
}

async function main() {
  log(`sql purge start dryRun=${dryRun} batch=${BATCH}`);
  const p = new PrismaClient();
  try {
    await p.$executeRawUnsafe(`SET statement_timeout = '600000'`); // 10m per statement
    const counts = await p.$queryRawUnsafe(COUNT_SQL);
    const row = counts[0] || {};
    const toDelete = Number(row.to_delete || 0);
    log(
      JSON.stringify({
        scanned: Number(row.scanned || 0),
        toDelete,
        urlGroups: Number(row.url_groups || 0),
        dryRun,
        batch: BATCH,
      })
    );
    if (dryRun || !toDelete) {
      log("sql purge done (dry-run or nothing to delete)");
      return;
    }

    let total = 0;
    let round = 0;
    const t0 = Date.now();
    while (true) {
      round++;
      const n = await p.$executeRawUnsafe(deleteBatchSql(BATCH));
      const deleted = Number(n);
      total += deleted;
      log(`batch ${round}: deleted ${deleted} (total ${total})`);
      if (deleted === 0) break;
      if (round > 500) {
        log("stopped after 500 batches (safety cap)");
        break;
      }
    }
    log(JSON.stringify({ deleted: total, ms: Date.now() - t0, rounds: round, done: true }));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  log(`FATAL ${e?.stack || e}`);
  process.exit(1);
});
