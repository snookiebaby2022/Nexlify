/**
 * Remove install/seed demo lines, streams, bouquets, MAG, and EPG samples.
 * Usage: npx tsx scripts/purge-demo-content.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const DEMO_STREAM_NAMES = ["Demo Sports HD", "Demo News", "Demo Movie"];
const DEMO_STREAM_IDS = ["seed-stream-1", "seed-stream-2"];
const DEMO_LINE_USERNAMES = ["demo"];
const DEMO_BOUQUET_IDS = ["seed-bouquet-basic"];
const DEMO_BOUQUET_NAMES = ["Basic Package"];
const DEMO_MAG_MACS = ["00:1A:79:00:00:01"];
const DEMO_EPG_IDS = ["seed-epg-demo", "seed-epg-prog-1"];
const DEMO_CATEGORY_IDS = ["seed-cat-sports", "seed-cat-movies"];

async function main() {
  const demoStreams = await prisma.stream.findMany({
    where: {
      OR: [
        { id: { in: DEMO_STREAM_IDS } },
        { name: { in: DEMO_STREAM_NAMES } },
        { streamUrl: { contains: "test-streams.mux.dev" } },
        { epgChannelId: "demo.sports.hd" },
      ],
    },
    select: { id: true, name: true },
  });

  const demoLines = await prisma.line.findMany({
    where: {
      OR: [
        { username: { in: DEMO_LINE_USERNAMES } },
        { externalId: { startsWith: "whmcs-demo" } },
      ],
    },
    select: { id: true, username: true },
  });

  const demoBouquets = await prisma.bouquet.findMany({
    where: {
      OR: [{ id: { in: DEMO_BOUQUET_IDS } }, { name: { in: DEMO_BOUQUET_NAMES } }],
    },
    select: { id: true, name: true },
  });

  const streamIds = demoStreams.map((s) => s.id);
  const lineIds = demoLines.map((l) => l.id);
  const bouquetIds = demoBouquets.map((b) => b.id);

  console.log(
    dryRun ? "[dry-run] Would remove:" : "Removing:",
    `${demoStreams.length} demo stream(s),`,
    `${demoLines.length} demo line(s),`,
    `${demoBouquets.length} demo bouquet(s)`
  );
  for (const s of demoStreams) console.log(`  stream: ${s.name} (${s.id})`);
  for (const l of demoLines) console.log(`  line: ${l.username} (${l.id})`);
  for (const b of demoBouquets) console.log(`  bouquet: ${b.name} (${b.id})`);

  if (dryRun) return;

  if (lineIds.length) {
    await prisma.liveConnection.deleteMany({ where: { lineId: { in: lineIds } } });
    await prisma.magDevice.deleteMany({
      where: { OR: [{ lineId: { in: lineIds } }, { mac: { in: DEMO_MAG_MACS } }] },
    });
    await prisma.line.deleteMany({ where: { id: { in: lineIds } } });
  } else {
    await prisma.magDevice.deleteMany({ where: { mac: { in: DEMO_MAG_MACS } } });
  }

  if (streamIds.length) {
    await prisma.bouquetStream.deleteMany({ where: { streamId: { in: streamIds } } });
    await prisma.streamProcess.deleteMany({ where: { streamId: { in: streamIds } } });
    await prisma.liveConnection.deleteMany({ where: { streamId: { in: streamIds } } });
    await prisma.stream.deleteMany({ where: { id: { in: streamIds } } });
  }

  if (bouquetIds.length) {
    await prisma.lineBouquet.deleteMany({ where: { bouquetId: { in: bouquetIds } } });
    await prisma.resellerBouquet.deleteMany({ where: { bouquetId: { in: bouquetIds } } });
    await prisma.bouquetStream.deleteMany({ where: { bouquetId: { in: bouquetIds } } });
    await prisma.bouquet.deleteMany({ where: { id: { in: bouquetIds } } });
  }

  await prisma.epgProgram.deleteMany({ where: { id: { in: ["seed-epg-prog-1"] } } });
  await prisma.epgSource.deleteMany({ where: { id: { in: DEMO_EPG_IDS } } });

  for (const catId of DEMO_CATEGORY_IDS) {
    const used = await prisma.stream.count({ where: { categoryId: catId } });
    if (used === 0) {
      await prisma.category.deleteMany({ where: { id: catId } });
      console.log(`  removed empty category ${catId}`);
    }
  }

  const fullBouquet = await prisma.bouquet.findFirst({ where: { name: "full" } });
  if (fullBouquet) {
    const remaining = await prisma.bouquetStream.count({ where: { bouquetId: fullBouquet.id } });
    const linesOnFull = await prisma.lineBouquet.count({ where: { bouquetId: fullBouquet.id } });
    if (remaining === 0 && linesOnFull === 0) {
      await prisma.bouquet.delete({ where: { id: fullBouquet.id } });
      console.log('  removed empty bouquet "full"');
    }
  }

  console.log("Demo content purge complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
