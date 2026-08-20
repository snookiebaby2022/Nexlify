/**
 * Re-link live streams to package bouquets + sync sort order (post-dedupe / migrate).
 * Usage: npx tsx scripts/repair-bouquet-links-now.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  repairBouquetCategorySplit,
  repairOrphanLiveBouquetLinks,
  syncLiveBouquetStreamSortOrders,
} from "../src/lib/repair-bouquet-category-split";
import { invalidateXtreamCategories } from "../src/lib/cache-invalidate";

const prisma = new PrismaClient();

async function main() {
  const bouquets = await prisma.bouquet.findMany({
    where: { isActive: true },
    select: { id: true, name: true, _count: { select: { lines: true } } },
  });
  const packages = bouquets
    .filter((b) => b._count.lines > 0)
    .map((b) => ({ id: b.id, name: b.name }));

  console.log("==> repairOrphanLiveBouquetLinks");
  const orphan = await repairOrphanLiveBouquetLinks(prisma, packages.length ? packages : bouquets);
  console.log(JSON.stringify(orphan));

  console.log("==> syncLiveBouquetStreamSortOrders");
  const synced = await syncLiveBouquetStreamSortOrders(prisma);
  console.log("sortSynced", synced);

  console.log("==> repairBouquetCategorySplit (categories + orphans)");
  const full = await repairBouquetCategorySplit(prisma);
  console.log(JSON.stringify(full, null, 2));

  await invalidateXtreamCategories();

  const uk = await prisma.category.findFirst({ where: { name: "UK | Entertainment" }, select: { id: true } });
  if (uk) {
    const sample = await prisma.stream.findMany({
      where: { categoryId: uk.id, isActive: true },
      select: {
        name: true,
        sortOrder: true,
        bouquets: { select: { sortOrder: true, bouquet: { select: { name: true } } } },
      },
      orderBy: { sortOrder: "asc" },
      take: 8,
    });
    console.log(
      "UK_ENT_SAMPLE",
      sample.map((s) => ({
        name: s.name,
        sort: s.sortOrder,
        pkg: s.bouquets[0]?.bouquet.name,
        bsSort: s.bouquets[0]?.sortOrder,
      }))
    );
  }

  const bbc = await prisma.stream.findFirst({
    where: { name: "BBC One FHD", type: "LIVE" },
    select: { bouquets: { select: { bouquet: { select: { name: true } } } } },
  });
  console.log("BBC_ONE_BOUQUETS", bbc?.bouquets.map((b) => b.bouquet.name));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
