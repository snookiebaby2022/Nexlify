/** Fast batch backfill for live streams only — instant XCIPTV playback auth. */
import { PrismaClient } from "@prisma/client";
import { cuidToNum } from "../src/lib/xtream-stream-id";

const prisma = new PrismaClient();
const BATCH = 500;

async function main() {
  let cursor: string | undefined;
  let updated = 0;
  for (;;) {
    const rows = await prisma.stream.findMany({
      where: { type: "LIVE", isActive: true, xtreamNum: null },
      select: { id: true },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (!rows.length) break;
    await prisma.$transaction(
      rows.map((row) =>
        prisma.stream.update({
          where: { id: row.id },
          data: { xtreamNum: cuidToNum(row.id) },
        })
      )
    );
    updated += rows.length;
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < BATCH) break;
    if (updated % 5000 === 0) console.log("live xtreamNum", updated);
  }
  const flags = await prisma.$executeRaw`
    UPDATE "Stream"
    SET "isOnDemand" = false, "vodMode" = 'LIVE'::"VodMode"
    WHERE type = 'LIVE'::"StreamType" AND "isActive" = true AND "isOnDemand" = true
      AND "streamUrl" ~* '^https?://' AND "streamUrl" NOT LIKE '%127.0.0.1%'
      AND "autoRestart" = false AND "hostedExternally" = false
  `;
  console.log("done live xtreamNum", updated, "flags", flags);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
