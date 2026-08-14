/**
 * Compare a MySQL dump’s table row counts to what bundleFromSqlFile maps.
 * Usage: npx tsx scripts/compare-migrate-dump.ts /path/to.dump.sql [source]
 */
import { previewMigrationBundle } from "../src/lib/panel-migration";
import { bundleFromSqlFile } from "../src/lib/panel-migration/map-rows";
import { parseSqlDumpFile, mergeSqlTables } from "../src/lib/panel-migration/sql-parse";
import type { MigrationSource } from "../src/lib/panel-migration/types";

async function main() {
  const dump = process.argv[2];
  const source = (process.argv[3] || "xui") as MigrationSource;
  if (!dump) {
    console.error("Usage: npx tsx scripts/compare-migrate-dump.ts <dump.sql> [source]");
    process.exit(1);
  }

  console.log("Parsing dump tables…");
  const { tables, createColumns } = await parseSqlDumpFile(dump, (r, t) => {
    if (r === t) console.log("  parse 100%");
  });

  const interesting = [
    "streams",
    "streams_episodes",
    "streams_series",
    "streams_categories",
    "bouquets",
    "lines",
    "users",
    "mag_devices",
    "enigma2_devices",
    "servers",
    "epg",
    "epg_channels",
    "epg_data",
    "providers",
    "providers_streams",
    "users_packages",
    "watch_folders",
    "tickets",
    "blocked_asns",
    "access_codes",
  ];

  console.log("\nDUMP TABLE ROWS");
  for (const name of interesting) {
    const chunks = tables.get(name) ?? [];
    for (const c of chunks) {
      if (!c.columns.length && createColumns.get(name)?.length) {
        c.columns = createColumns.get(name)!.slice();
      }
    }
    const merged = mergeSqlTables(chunks);
    console.log(`${name}\t${merged?.rows.length ?? 0}`);
  }

  console.log(`\nBuilding migration bundle (source=${source})…`);
  const bundle = await bundleFromSqlFile(dump, source);
  const p = previewMigrationBundle(bundle);
  console.log("\nMAPPED PREVIEW COUNTS");
  console.log(JSON.stringify(p.counts, null, 2));
  if (p.warnings?.length) {
    console.log("\nWARNINGS");
    for (const w of p.warnings.slice(0, 40)) console.log("-", w);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
