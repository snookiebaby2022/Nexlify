import { prisma } from "@/lib/prisma";

const MAX_WARM_FANS = Number(process.env.NEXLIFY_EDGE_PREWARM_MAX || 24);
const MIN_VIEWERS = Number(process.env.NEXLIFY_EDGE_PREWARM_MIN_VIEWERS || 3);

export type HotChannel = {
  streamId: string;
  viewers: number;
};

/** Top live channels by active viewer count for edge fan prewarm. */
export async function listHotChannels(limit = MAX_WARM_FANS): Promise<HotChannel[]> {
  const since = new Date(Date.now() - 20 * 60_000);
  const rows = await prisma.liveConnection.groupBy({
    by: ["streamId"],
    where: { lastSeenAt: { gte: since }, streamId: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit * 2,
  });
  return rows
    .filter((r) => r.streamId && r._count.id >= MIN_VIEWERS)
    .slice(0, limit)
    .map((r) => ({ streamId: r.streamId as string, viewers: r._count.id }));
}

export function buildEdgePrewarmTargets(channels: HotChannel[], edgeHost: string, port = 8080): string[] {
  const host = edgeHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return channels.map(
    (c) => `http://${host}:${port}/edge/prewarm?streamId=${encodeURIComponent(c.streamId)}`
  );
}
