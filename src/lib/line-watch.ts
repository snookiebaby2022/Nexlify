import { prisma } from "@/lib/prisma";

/** Record a line watching a channel (playback hit). */
export async function recordLineWatch(lineId: string, streamId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.lineChannelWatch.upsert({
      where: { lineId_streamId: { lineId, streamId } },
      create: { lineId, streamId, watchCount: 1, lastWatchedAt: now },
      update: { watchCount: { increment: 1 }, lastWatchedAt: now },
    }),
    prisma.line.update({
      where: { id: lineId },
      data: { lastWatchedAt: now, lastWatchedStreamId: streamId },
    }),
  ]);
}

export async function getLineWatchSummary(lineId: string) {
  const [line, recent] = await Promise.all([
    prisma.line.findUnique({
      where: { id: lineId },
      select: {
        lastWatchedAt: true,
        lastWatchedStream: { select: { id: true, name: true } },
        _count: { select: { channelWatches: true } },
      },
    }),
    prisma.lineChannelWatch.findMany({
      where: { lineId },
      orderBy: { lastWatchedAt: "desc" },
      take: 10,
      include: { stream: { select: { id: true, name: true, type: true } } },
    }),
  ]);
  return {
    lastWatchedAt: line?.lastWatchedAt ?? null,
    lastWatchedStream: line?.lastWatchedStream ?? null,
    channelsWatched: line?._count.channelWatches ?? 0,
    recentChannels: recent.map((r) => ({
      streamId: r.streamId,
      name: r.stream.name,
      type: r.stream.type,
      watchCount: r.watchCount,
      lastWatchedAt: r.lastWatchedAt,
    })),
  };
}
