/**
 * One-shot post-migration repair: merge duplicate categories/bouquets + remove duplicate streams.
 * Usage: npx tsx scripts/run-migration-repair.ts [--dedupe]
 */
import { PrismaClient } from "@prisma/client";
import { repairBouquetCategorySplit } from "../src/lib/repair-bouquet-category-split";
import { repairImportedPanel } from "../src/lib/repair-imported-panel";
import { findDuplicateGroups, deleteDuplicateStreams } from "../src/lib/stream-duplicates";

const prisma = new PrismaClient();
const dedupe = process.argv.includes("--dedupe");

async function main() {
  console.log("==> repairImportedPanel");
  const panel = await repairImportedPanel(prisma);
  console.log(JSON.stringify(panel, null, 2));

  console.log("==> repairBouquetCategorySplit");
  const cats = await repairBouquetCategorySplit(prisma);
  console.log(JSON.stringify(cats, null, 2));

  if (dedupe) {
    let totalDeleted = 0;
    for (const kind of ["live", "movies", "series"] as const) {
      console.log(`==> dedupe ${kind}`);
      const { groups, scanned, extraCopies } = await findDuplicateGroups(kind);
      console.log(`  scanned=${scanned} extraCopies=${extraCopies} groups=${groups.length}`);
      const toDelete: string[] = [];
      for (const g of groups) {
        for (const m of g.members) {
          if (m.id !== g.keepId) toDelete.push(m.id);
        }
      }
      if (toDelete.length) {
        const { deleted, skipped } = await deleteDuplicateStreams(toDelete);
        console.log(`  deleted=${deleted} skipped=${skipped}`);
        totalDeleted += deleted;
      }
    }
    console.log(`==> total streams deleted: ${totalDeleted}`);
  }

  const uk = await prisma.category.findMany({
    where: {
      AND: [
        { name: { contains: "UK", mode: "insensitive" } },
        { name: { contains: "Entertainment", mode: "insensitive" } },
      ],
    },
    select: { name: true, _count: { select: { streams: true } } },
  });
  console.log("==> UK Entertainment categories after repair:", JSON.stringify(uk));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
