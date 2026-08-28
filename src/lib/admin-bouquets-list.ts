import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bouquetContentCountsByBouquetId,
  emptyBouquetContentCounts,
} from "@/lib/bouquet-counts";

export async function listAdminBouquets(_session: SessionUser) {
  const bouquets = await prisma.bouquet.findMany({
    select: {
      id: true,
      name: true,
      isActive: true,
      sortOrder: true,
      ownerUserId: true,
      _count: { select: { lines: true, streams: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const countMap = await bouquetContentCountsByBouquetId(
    prisma,
    bouquets.map((b) => b.id)
  );

  return bouquets.map((b) => ({
    ...b,
    ownerUserId: b.ownerUserId ?? null,
    streams: [] as { stream: { type: string } }[],
    contentCounts: countMap.get(b.id) ?? emptyBouquetContentCounts(),
  }));
}
