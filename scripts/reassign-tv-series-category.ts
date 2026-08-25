/**
 * Move series out of the duplicate "TV Series" category (same name as the bouquet)
 * into Other / genre categories, then delete the empty category.
 *
 *   npx tsx scripts/reassign-tv-series-category.ts
 */
import { prisma } from "../src/lib/prisma";
import { reassignTvSeriesNamedCategory } from "../src/lib/vod-category";
import { invalidateXtreamCategories } from "../src/lib/cache-invalidate";

async function main() {
  const result = await reassignTvSeriesNamedCategory();
  await invalidateXtreamCategories();
  console.log("reassign-tv-series-category", result);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
