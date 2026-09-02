import { prisma } from "../src/lib/prisma";

async function main() {
  const uk = await prisma.bouquet.findFirst({ where: { name: "UK no XXX" } });
  if (!uk) throw new Error("no UK bouquet");
  const orphans = await prisma.stream.findMany({
    where: {
      type: "LIVE",
      isActive: true,
      bouquets: { none: {} },
      name: { contains: "BBC", mode: "insensitive" },
    },
    select: { id: true, name: true },
  });
  const res = await prisma.bouquetStream.createMany({
    data: orphans.map((s, i) => ({ bouquetId: uk.id, streamId: s.id, sortOrder: 60_000 + i })),
    skipDuplicates: true,
  });
  console.log(JSON.stringify({ bbcOrphansLinked: res.count, names: orphans.map((s) => s.name) }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
