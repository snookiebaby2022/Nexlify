/**
 * Compare dump bouquets to panel DB membership/order.
 *   npx tsx scripts/verify-bouquets-vs-dump.ts /tmp/dump.sql xui
 */
import { PrismaClient } from "@prisma/client";
import { bundleFromSqlFile } from "../src/lib/panel-migration/map-rows";
import { urlsFromPhpSerialized, looksLikePlayableUrl } from "../src/lib/panel-migration/sql-junctions";
import type { MigrationSource } from "../src/lib/panel-migration/types";

const dumpPath = process.argv[2];
const source = (process.argv[3] || "xui") as MigrationSource;
if (!dumpPath) {
  console.error("Usage: npx tsx scripts/verify-bouquets-vs-dump.ts <dump.sql> [source]");
  process.exit(1);
}

function norm(raw: string): string {
  let u = String(raw ?? "").trim();
  if (/^(a|O|C):\d+:\{/.test(u) || /^s:\d+:"/.test(u)) {
    u = urlsFromPhpSerialized(u)[0] ?? "";
  }
  if (!looksLikePlayableUrl(u) && !u.startsWith("pending://")) {
    const php = urlsFromPhpSerialized(u)[0];
    if (php) u = php;
  }
  return u.trim();
}

async function main() {
  const prisma = new PrismaClient();
  console.log("Scanning dump…");
  const bundle = await bundleFromSqlFile(dumpPath, source);
  const existing = await prisma.stream.findMany({
    select: { id: true, streamUrl: true, type: true },
  });
  const byUrl = new Map(existing.map((s) => [s.streamUrl, s]));
  const legacyToId = new Map<string, string>();
  for (const s of bundle.streams) {
    if (!s.legacyId) continue;
    const url = norm(String(s.streamUrl ?? ""));
    const hit = url ? byUrl.get(url) : undefined;
    if (hit) legacyToId.set(String(s.legacyId), hit.id);
  }
  console.log(
    JSON.stringify({
      dumpBouquets: bundle.bouquets.length,
      dumpStreams: bundle.streams.length,
      mappedStreams: legacyToId.size,
      panelStreams: existing.length,
    })
  );

  const dbBouquets = await prisma.bouquet.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { streams: true } } },
  });

  console.log("\nORDER CHECK (dump index vs DB sortOrder):");
  let orderOk = true;
  for (let i = 0; i < bundle.bouquets.length; i++) {
    const d = bundle.bouquets[i];
    const db = dbBouquets[i];
    const nameOk = db && db.name === d.name;
    const orderMatch = db && db.sortOrder === i;
    if (!nameOk || !orderMatch) orderOk = false;
    console.log(
      `${String(i).padStart(2)} dump=${d.name.slice(0, 40).padEnd(40)} db=${(db?.name ?? "MISSING").slice(0, 40).padEnd(40)} sort=${db?.sortOrder} ${nameOk && orderMatch ? "OK" : "MISMATCH"}`
    );
  }
  console.log("orderOk=", orderOk);

  console.log("\nMEMBERSHIP (live/movie/radio IDs mapped vs DB links; series=catalog count):");
  for (const b of bundle.bouquets) {
    const ids = b.streamLegacyIds ?? [];
    // After expand, streamLegacyIds already includes episodes. For verify of raw dump
    // channels/movies/radios we need pre-expand counts — seriesCatalogLegacyIds is separate.
    // Recompute expected mapped live/movie/radio from seriesCatalog not in streamLegacyIds
    // Actually after expand, streamLegacyIds = channels+movies+radios+episodes.
    let mapped = 0;
    let missing = 0;
    const missingSample: string[] = [];
    // Approximate: count how many of current streamLegacyIds map
    for (const id of ids) {
      if (legacyToId.has(String(id))) mapped++;
      else {
        missing++;
        if (missingSample.length < 3) missingSample.push(String(id));
      }
    }
    const db = dbBouquets.find((x) => x.name === b.name);
    const dbCount = db?._count.streams ?? -1;
    const delta = dbCount - mapped;
    console.log(
      JSON.stringify({
        name: b.name,
        dumpOrder: b.sortOrder,
        seriesCatalog: b.seriesCatalogLegacyIds?.length ?? 0,
        streamIdsInBundle: ids.length,
        mappedToPanel: mapped,
        unmappedIds: missing,
        missingSample,
        dbLinks: dbCount,
        deltaDbMinusMapped: delta,
        match: dbCount === mapped,
      })
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
