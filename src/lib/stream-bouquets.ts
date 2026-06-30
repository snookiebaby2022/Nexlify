import { prisma } from "./prisma";

export async function getStreamBouquetIds(streamId: string): Promise<string[]> {
  const rows = await prisma.bouquetStream.findMany({
    where: { streamId },
    orderBy: { sortOrder: "asc" },
    select: { bouquetId: true },
  });
  return rows.map((r) => r.bouquetId);
}

/** Replace bouquet membership for a stream (empty array clears all). */
export async function syncStreamBouquets(streamId: string, bouquetIds: string[]) {
  await prisma.bouquetStream.deleteMany({ where: { streamId } });
  if (!bouquetIds.length) return;
  await prisma.bouquetStream.createMany({
    data: bouquetIds.map((bouquetId, i) => ({
      bouquetId,
      streamId,
      sortOrder: 9000 + i,
    })),
    skipDuplicates: true,
  });
}
