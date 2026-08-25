/**
 * Pull Plex Genre tags and assign flat Xtream categories (Action, Comedy, …).
 * Usage: npx tsx scripts/backfill-plex-genres.ts
 */
import { prisma } from "../src/lib/prisma";
import { backfillAllPlexGenresFromLibrary } from "../src/lib/media-integrations";

async function main() {
  const results = await backfillAllPlexGenresFromLibrary({
    jobId: "cli-genres",
    step: async (phase, message) => console.log(`[${phase}] ${message}`),
    note: async (message) => console.log(message),
    counts: async () => {},
    done: async (message) => console.log(message),
    fail: async (error) => console.error(error),
    snapshot: () =>
      ({
        jobId: "cli-genres",
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
  console.log(JSON.stringify({ results }, null, 2));

  const movieCats = await prisma.$queryRaw<{ name: string; n: bigint }[]>`
    SELECT c.name, count(*)::bigint AS n
    FROM "Stream" s
    JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."streamUrl" LIKE 'nexlify://plex/%' AND s.type = 'MOVIE'
    GROUP BY c.name
    ORDER BY n DESC
    LIMIT 25
  `;
  const seriesCats = await prisma.$queryRaw<{ name: string; n: bigint }[]>`
    SELECT c.name, count(*)::bigint AS n
    FROM "Stream" s
    JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."streamUrl" LIKE 'nexlify://plex/%' AND s.type = 'SERIES'
    GROUP BY c.name
    ORDER BY n DESC
    LIMIT 25
  `;
  console.log(
    JSON.stringify(
      {
        movieCats: movieCats.map((r) => ({ name: r.name, n: Number(r.n) })),
        seriesCats: seriesCats.map((r) => ({ name: r.name, n: Number(r.n) })),
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
