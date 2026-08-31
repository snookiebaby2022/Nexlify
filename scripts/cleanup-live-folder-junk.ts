/**
 * LIVE only:
 * 1) Merge folders that differ only by letter case (UK | ENTERTAINMENT → UK | Entertainment).
 * 2) Delete extra streams with the exact same name in the same folder.
 * Does not strip HD/SD/FHD/HEVC/+1. Does not mix providers. Does not touch movies/series.
 */
import { PrismaClient, StreamType } from "@prisma/client";
import { invalidateDashboardStats, invalidateXtreamCategories } from "../src/lib/cache-invalidate";

const prisma = new PrismaClient();

function folderKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function streamNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isShouting(name: string): boolean {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

async function moveBouquetLinks(fromId: string, toId: string) {
  const links = await prisma.bouquetStream.findMany({
    where: { streamId: fromId },
    select: { bouquetId: true },
  });
  for (const link of links) {
    await prisma.bouquetStream.upsert({
      where: { bouquetId_streamId: { bouquetId: link.bouquetId, streamId: toId } },
      create: { bouquetId: link.bouquetId, streamId: toId },
      update: {},
    });
  }
  if (links.length) {
    await prisma.bouquetStream.deleteMany({ where: { streamId: fromId } });
  }
}

async function mergeCaseDuplicateFolders() {
  const cats = await prisma.category.findMany({
    where: { categoryType: "LIVE" },
    select: { id: true, name: true, createdAt: true, _count: { select: { streams: true } } },
  });
  const buckets = new Map<string, typeof cats>();
  for (const c of cats) {
    const key = folderKey(c.name);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  const merged: { from: string; to: string; moved: number }[] = [];
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      const aYell = isShouting(a.name) ? 1 : 0;
      const bYell = isShouting(b.name) ? 1 : 0;
      if (aYell !== bYell) return aYell - bYell;
      if (b._count.streams !== a._count.streams) return b._count.streams - a._count.streams;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keep = ranked[0]!;
    for (const drop of ranked.slice(1)) {
      const moved = await prisma.stream.updateMany({
        where: { categoryId: drop.id },
        data: { categoryId: keep.id },
      });
      await prisma.category.delete({ where: { id: drop.id } }).catch(() => undefined);
      merged.push({ from: drop.name, to: keep.name, moved: moved.count });
    }
  }
  return merged;
}

async function removeExactNameCopies() {
  const rows = await prisma.stream.findMany({
    where: { type: StreamType.LIVE, isRadio: false },
    select: {
      id: true,
      name: true,
      categoryId: true,
      createdAt: true,
      isActive: true,
      streamIcon: true,
      isOnDemand: true,
      _count: { select: { bouquets: true } },
    },
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.categoryId ?? ""}::${streamNameKey(row.name)}`;
    if (!streamNameKey(row.name)) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  let deleted = 0;
  let groupsHit = 0;
  const samples: { kept: string; copies: number }[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    groupsHit += 1;
    const ranked = [...group].sort((a, b) => {
      if (b._count.bouquets !== a._count.bouquets) return b._count.bouquets - a._count.bouquets;
      const aIcon = String(a.streamIcon ?? "").trim() ? 1 : 0;
      const bIcon = String(b.streamIcon ?? "").trim() ? 1 : 0;
      if (bIcon !== aIcon) return bIcon - aIcon;
      if (Number(b.isActive) !== Number(a.isActive)) return Number(b.isActive) - Number(a.isActive);
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keep = ranked[0]!;
    if (samples.length < 20) {
      samples.push({ kept: keep.name, copies: group.length });
    }
    const dropIds: string[] = [];
    for (const drop of ranked.slice(1)) {
      await moveBouquetLinks(drop.id, keep.id);
      dropIds.push(drop.id);
    }
    for (let i = 0; i < dropIds.length; i += 100) {
      const chunk = dropIds.slice(i, i + 100);
      const gone = await prisma.stream.deleteMany({ where: { id: { in: chunk } } });
      deleted += gone.count;
    }
  }

  return { scanned: rows.length, groupsHit, deleted, samples };
}

async function main() {
  const before = await prisma.category.findMany({
    where: { name: { in: ["UK | Entertainment", "UK | ENTERTAINMENT", "UK | Entertainment (HEVC)"] } },
    select: { name: true, _count: { select: { streams: true } } },
  });
  console.log("BEFORE", JSON.stringify(before));

  const merged = await mergeCaseDuplicateFolders();
  console.log("FOLDER_MERGES", JSON.stringify(merged, null, 2));

  const dedupe = await removeExactNameCopies();
  console.log("EXACT_NAME_DEDUPE", JSON.stringify(dedupe, null, 2));

  if (merged.length || dedupe.deleted) {
    await invalidateXtreamCategories();
    await invalidateDashboardStats();
  }

  const after = await prisma.category.findMany({
    where: {
      categoryType: "LIVE",
      name: {
        in: [
          "UK | Entertainment",
          "UK | ENTERTAINMENT",
          "UK | Entertainment (HEVC)",
          "UK | Sky Sports",
          "UK | Sky Sports +",
          "UK | SKY SPORTS +",
          "UK | Sky Sports + EFL",
          "UK | Sky Sports / TNT Sports (HEVC)",
          "UK | Movies",
          "UK | MOVIES",
          "UK | Movies (HEVC)",
          "UK | News",
          "UK | NEWS",
          "UK | Kids",
          "UK | KIDS",
          "UK | Documentaries",
          "UK | DOCUMENTARIES",
          "UK | Documentary",
        ],
      },
    },
    select: { name: true, _count: { select: { streams: true } } },
    orderBy: { name: "asc" },
  });
  console.log("AFTER", JSON.stringify(after, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
