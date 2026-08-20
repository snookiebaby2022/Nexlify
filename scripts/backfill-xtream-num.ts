/**
 * Backfill Stream.xtreamNum for all streams (movies/series/VOD included).
 * Run on panel server: npx tsx scripts/backfill-xtream-num.ts
 */
import { PrismaClient } from "@prisma/client";
import { cuidToNum } from "../src/lib/xtream-stream-id";

const prisma = new PrismaClient();
const BATCH = 500;

async function backfillXtreamNum() {
  let cursor: string | undefined;
  let updated = 0;
  for (;;) {
    const rows = await prisma.stream.findMany({
      where: { xtreamNum: null },
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
    if (updated % 5000 === 0) console.log("xtreamNum backfill", updated);
  }
  console.log("xtreamNum backfill done", updated);
}

async function fixLiveDirectFlags() {
  const result = await prisma.$executeRaw`
    UPDATE "Stream"
    SET "isOnDemand" = false,
        "vodMode" = 'LIVE'::"VodMode"
    WHERE type = 'LIVE'::"StreamType"
      AND "isActive" = true
      AND "isOnDemand" = true
      AND "streamUrl" ~* '^https?://'
      AND "streamUrl" NOT LIKE '%127.0.0.1%'
      AND "streamUrl" NOT LIKE 'file://%'
      AND "autoRestart" = false
      AND "hostedExternally" = false
  `;
  console.log("live direct relay flags fixed", result);
}

async function main() {
  await backfillXtreamNum();
  await fixLiveDirectFlags();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
