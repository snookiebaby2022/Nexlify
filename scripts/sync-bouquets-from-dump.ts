/**
 * Rebuild bouquet order + membership from an XUI SQL dump so Manage Bouquets
 * matches the dump exactly (without re-uploading or re-writing every stream row).
 *
 *   npx tsx scripts/sync-bouquets-from-dump.ts /tmp/nexlify-migrate-….sql xui
 */
import { PrismaClient } from "@prisma/client";
import { bundleFromSqlFile } from "../src/lib/panel-migration/map-rows";
import { urlsFromPhpSerialized, looksLikePlayableUrl } from "../src/lib/panel-migration/sql-junctions";
import type { MigrationSource } from "../src/lib/panel-migration/types";

const dumpPath = process.argv[2];
const source = (process.argv[3] || "xui") as MigrationSource;

if (!dumpPath) {
  console.error("Usage: npx tsx scripts/sync-bouquets-from-dump.ts <dump.sql> [source]");
  process.exit(1);
}

function normalizeUrl(raw: string): string {
  let streamUrl = String(raw ?? "").trim();
  if (/^(a|O|C):\d+:\{/.test(streamUrl) || /^s:\d+:"/.test(streamUrl)) {
    streamUrl = urlsFromPhpSerialized(streamUrl)[0] ?? "";
  }
  if (!looksLikePlayableUrl(streamUrl) && !streamUrl.startsWith("pending://")) {
    const php = urlsFromPhpSerialized(streamUrl)[0];
    if (php) streamUrl = php;
  }
  return streamUrl.trim();
}

async function main() {
  const prisma = new PrismaClient();
  console.log("Scanning dump…", dumpPath);
  const bundle = await bundleFromSqlFile(dumpPath, source, (read, total) => {
    const pct = Math.round((read / Math.max(1, total)) * 100);
    if (pct % 10 === 0) process.stdout.write(`\rscan ${pct}%`);
  });
  console.log(
    `\nDump bouquets=${bundle.bouquets.length} streams=${bundle.streams.length} categories=${bundle.phase2?.categories?.length ?? 0}`
  );

  console.log("Loading panel stream URLs…");
  const existing = await prisma.stream.findMany({ select: { id: true, streamUrl: true } });
  const byUrl = new Map<string, string>();
  for (const s of existing) {
    if (s.streamUrl) byUrl.set(s.streamUrl, s.id);
  }

  const streamIdByLegacy = new Map<string, string>();
  let mapped = 0;
  for (const s of bundle.streams) {
    if (!s.legacyId) continue;
    const url = normalizeUrl(String(s.streamUrl ?? ""));
    if (!url) continue;
    const id = byUrl.get(url);
    if (!id) continue;
    streamIdByLegacy.set(String(s.legacyId), id);
    mapped++;
  }
  console.log(`Mapped ${mapped}/${bundle.streams.length} dump streams → panel by URL`);

  // Categories: restore dump order (+ parent links already in DB)
  if (bundle.phase2?.categories?.length) {
    console.log("Updating category sortOrder from dump…");
    for (const c of bundle.phase2.categories) {
      const name = String(c.name ?? "").trim();
      if (!name) continue;
      await prisma.category.updateMany({
        where: { name, categoryType: c.categoryType as never },
        data: { sortOrder: Number(c.sortOrder) || 0 },
      });
    }
  }

  console.log("Syncing bouquets…");
  const LINK_BATCH = 500;
  let totalLinks = 0;
  for (const b of bundle.bouquets) {
    const name = String(b.name ?? "").trim();
    if (!name) continue;
    let bouquet = await prisma.bouquet.findFirst({ where: { name } });
    if (!bouquet) {
      bouquet = await prisma.bouquet.create({
        data: {
          name,
          sortOrder: Number(b.sortOrder) || 0,
          isActive: true,
        },
      });
      console.log(`  created missing bouquet: ${name}`);
    } else {
      await prisma.bouquet.update({
        where: { id: bouquet.id },
        data: { sortOrder: Number(b.sortOrder) || 0, isActive: true },
      });
    }

    const rows: { bouquetId: string; streamId: string; sortOrder: number }[] = [];
    const seen = new Set<string>();
    for (const legacy of b.streamLegacyIds ?? []) {
      const streamId = streamIdByLegacy.get(String(legacy));
      if (!streamId || seen.has(streamId)) continue;
      seen.add(streamId);
      rows.push({ bouquetId: bouquet.id, streamId, sortOrder: rows.length });
    }

    await prisma.bouquetStream.deleteMany({ where: { bouquetId: bouquet.id } });
    for (let i = 0; i < rows.length; i += LINK_BATCH) {
      await prisma.bouquetStream.createMany({
        data: rows.slice(i, i + LINK_BATCH),
        skipDuplicates: true,
      });
    }
    totalLinks += rows.length;
    console.log(`  ${String(b.sortOrder).padStart(2)} ${name}: ${rows.length} streams`);
  }

  // Remove panel bouquets that are not in the dump (by name), only if empty of lines? Keep them — safer.
  console.log(`Done. ${bundle.bouquets.length} bouquets, ${totalLinks} links restored from dump.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
