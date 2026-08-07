import { prisma } from "./prisma";
import { nextStreamSortOrder } from "./stream-order";

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

  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { sortOrder: true },
  });
  const base = stream?.sortOrder ?? (await nextStreamSortOrder());

  await prisma.bouquetStream.createMany({
    data: bouquetIds.map((bouquetId, i) => ({
      bouquetId,
      streamId,
      sortOrder: base + i,
    })),
    skipDuplicates: true,
  });
}
