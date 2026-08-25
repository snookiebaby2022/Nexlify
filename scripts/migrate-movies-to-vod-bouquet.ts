/**
 * Move all movies into VOD bouquet and delete the Movies bouquet.
 * Usage: npx tsx scripts/migrate-movies-to-vod-bouquet.ts
 */
import { prisma } from "../src/lib/prisma";
import { migrateMoviesBouquetToVod } from "../src/lib/integration-bouquet";
import { invalidateXtreamCategories } from "../src/lib/cache-invalidate";

async function main() {
  const result = await migrateMoviesBouquetToVod();
  await invalidateXtreamCategories();
  console.log(JSON.stringify(result, null, 2));

  const counts = await prisma.$queryRaw<{ name: string; n: bigint }[]>`
    SELECT b.name, count(*)::bigint AS n
    FROM "BouquetStream" bs
    JOIN "Bouquet" b ON b.id = bs."bouquetId"
    JOIN "Stream" s ON s.id = bs."streamId"
    WHERE s.type = 'MOVIE'
    GROUP BY b.name
    ORDER BY n DESC
  `;
  console.log(
    JSON.stringify(
      { movieBouquets: counts.map((r) => ({ name: r.name, n: Number(r.n) })) },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
