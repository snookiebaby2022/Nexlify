/**
 * Fill movie/series posters + plot/cast from TMDB (unique titles).
 *   npx tsx scripts/backfill-tmdb-vod.ts
 */
import { prisma } from "../src/lib/prisma";
import { backfillTmdbVodBatch, markTmdbVodBackfillRunning } from "../src/lib/vod-tmdb-backfill";

async function main() {
  await markTmdbVodBackfillRunning(true);
  let loops = 0;
  let movies = 0;
  let series = 0;
  let missed = 0;
  try {
    for (;;) {
      loops++;
      const batch = await backfillTmdbVodBatch({ movieLimit: 50, seriesLimit: 50 });
      movies += batch.movies;
      series += batch.series;
      missed += batch.missed;
      console.log(
        `loop ${loops}: movies=${batch.movies} series=${batch.series} missed=${batch.missed} totals movies=${movies} series=${series} missed=${missed}`
      );
      if (batch.done && batch.movies === 0 && batch.series === 0) break;
      if (loops > 400) break;
    }
  } finally {
    await markTmdbVodBackfillRunning(false);
  }
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
