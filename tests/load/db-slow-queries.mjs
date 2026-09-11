/**
 * Dump slowest statements from pg_stat_statements (if extension exists)
 * and write tests/load/reports/db-slow-queries.json.
 *
 * Safe: read-only SQL against TEST_DATABASE_URL only.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadEnvTest, assertSafeTestDatabaseUrl } from "./env.mjs";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "reports");

async function main() {
  loadEnvTest(true);
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assertSafeTestDatabaseUrl(url);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  mkdirSync(OUT_DIR, { recursive: true });

  let extensionOk = false;
  try {
    const ext = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      ) AS ok
    `;
    extensionOk = Boolean(ext?.[0]?.ok);
  } catch {
    extensionOk = false;
  }

  let rows = [];
  if (extensionOk) {
    rows = await prisma.$queryRaw`
      SELECT
        round(total_exec_time::numeric, 2) AS total_ms,
        round(mean_exec_time::numeric, 2) AS mean_ms,
        round(max_exec_time::numeric, 2) AS max_ms,
        calls,
        rows AS row_count,
        left(query, 500) AS query
      FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
      ORDER BY mean_exec_time DESC
      LIMIT 25
    `;
  }

  // Always include EXPLAIN ANALYZE samples for known hot paths when fixtures exist
  const fixturesPath = resolve(__dirname, ".fixtures.json");
  const explains = [];
  if (existsSync(fixturesPath)) {
    const f = JSON.parse(readFileSync(fixturesPath, "utf8"));
    const samples = [
      {
        name: "line_by_username",
        sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT * FROM "Line" WHERE username = $1`,
        params: [f.credentials?.line?.username || "load_line"],
      },
      {
        name: "bouquet_stream_membership",
        sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT DISTINCT bs."streamId"
          FROM "BouquetStream" bs
          WHERE bs."bouquetId" = $1`,
        params: [f.bouquetId],
      },
      {
        name: "lean_listing_join",
        sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT s.id, s.name, s.type, s."sortOrder"
          FROM (
            SELECT DISTINCT bs."streamId" AS "streamId"
            FROM "BouquetStream" bs
            WHERE bs."bouquetId" = $1
          ) m
          INNER JOIN "Stream" s ON s.id = m."streamId"
          WHERE s."isActive" = true AND s.type::text = 'LIVE'
          ORDER BY s."sortOrder" ASC, s.name ASC, s.id ASC
          LIMIT 1500`,
        params: [f.bouquetId],
      },
    ];
    for (const sample of samples) {
      try {
        const plan = await prisma.$queryRawUnsafe(sample.sql, ...sample.params);
        explains.push({ name: sample.name, plan });
      } catch (e) {
        explains.push({
          name: sample.name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const payload = {
    capturedAt: new Date().toISOString(),
    pg_stat_statements: extensionOk,
    topByMean: rows,
    explains,
    note: extensionOk
      ? "Live means from pg_stat_statements after load run."
      : "Extension missing — enable CREATE EXTENSION pg_stat_statements; see SLOW-QUERIES.md for static top-10.",
  };

  const out = resolve(OUT_DIR, "db-slow-queries.json");
  writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${out} (pg_stat_statements=${extensionOk}, rows=${rows.length})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
