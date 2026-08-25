/**
 * Re-assign Plex movies/series to flat genre categories and re-link VOD bouquets.
 * Usage: npx tsx scripts/repair-plex-vod-placement.ts
 */
import { prisma } from "../src/lib/prisma";
import { repairAllPlexVodPlacement } from "../src/lib/media-integrations";

async function main() {
  const placement = await repairAllPlexVodPlacement({
    jobId: "cli-repair",
    step: async (phase, message) => console.log(`[${phase}] ${message}`),
    note: async (message) => console.log(message),
    counts: async () => {},
    done: async (message) => console.log(message),
    fail: async (error) => console.error(error),
    snapshot: () =>
      ({
        jobId: "cli-repair",
        phase: "cli",
        message: "",
        current: 0,
        total: 0,
        imported: 0,
        skipped: 0,
        episodes: 0,
        warnings: [],
        steps: [],
        updatedAt: new Date().toISOString(),
      }) as never,
  });
  console.log(JSON.stringify({ plexPlacement: placement }, null, 2));

  const movieCats = await prisma.$queryRaw<{ name: string; n: bigint }[]>`
    SELECT c.name, count(*)::bigint AS n
    FROM "Stream" s
    JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."streamUrl" LIKE 'nexlify://plex/%' AND s.type = 'MOVIE'
    GROUP BY c.name
    ORDER BY n DESC
    LIMIT 20
  `;
  const seriesCats = await prisma.$queryRaw<{ name: string; n: bigint }[]>`
    SELECT c.name, count(*)::bigint AS n
    FROM "Stream" s
    JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."streamUrl" LIKE 'nexlify://plex/%' AND s.type = 'SERIES'
    GROUP BY c.name
    ORDER BY n DESC
    LIMIT 20
  `;
  const seriesCatCount = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(DISTINCT s."categoryId")::bigint AS n
    FROM "Stream" s
    WHERE s."streamUrl" LIKE 'nexlify://plex/%' AND s.type = 'SERIES'
  `;
  console.log(
    JSON.stringify(
      {
        movieCats: movieCats.map((r) => ({ name: r.name, n: Number(r.n) })),
        seriesCats: seriesCats.map((r) => ({ name: r.name, n: Number(r.n) })),
        distinctSeriesCategoryCount: Number(seriesCatCount[0]?.n ?? 0),
      },
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
