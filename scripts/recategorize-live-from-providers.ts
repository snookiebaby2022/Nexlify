import { prisma } from "../src/lib/prisma";
import { recategorizeLiveFromProviders } from "../src/lib/recategorize-from-provider";
import { buildAutoSortUpdates, resolveSortLines } from "../src/lib/category-auto-sort";
import { invalidateDashboardStats, invalidateXtreamCategories } from "../src/lib/cache-invalidate";

const dryRun = process.argv.includes("--dry-run");

const result = await recategorizeLiveFromProviders({ dryRun, sampleLimit: 40 });
console.log(
  JSON.stringify(
    {
      dryRun,
      providers: result.providers,
      remoteStreams: result.remoteStreams,
      matched: result.matched,
      updated: result.updated,
      unchanged: result.unchanged,
      unmatched: result.unmatched,
      createdCategories: result.createdCategories,
      samples: result.samples,
    },
    null,
    2
  )
);

if (!dryRun) {
  const rows = await prisma.category.findMany({
    where: { categoryType: "LIVE" },
    select: { id: true, name: true, parentId: true, sortOrder: true },
  });
  const updates = buildAutoSortUpdates(rows, resolveSortLines("operator-order"));
  if (updates.length) {
    await prisma.$transaction(
      updates.map((u) => prisma.category.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } }))
    );
    await invalidateXtreamCategories();
    await invalidateDashboardStats();
  }
  console.log(`auto-order updated ${updates.length} of ${rows.length} live folders`);
}

await prisma.$disconnect();
