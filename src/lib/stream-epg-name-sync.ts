import { prisma } from "@/lib/prisma";
import { parseLiveStreamMeta } from "@/lib/stream-live-meta";

/** XUI-style: refresh LIVE stream titles from the current EPG programme (football fixtures, etc.). */
export async function syncStreamNamesFromEpg(limit = 40): Promise<number> {
  const now = new Date();
  const streams = await prisma.stream.findMany({
    where: {
      type: "LIVE",
      isActive: true,
      epgChannelId: { not: null },
      agentStartCmd: { contains: "autoSyncNameFromEpg" },
    },
    select: { id: true, name: true, epgChannelId: true, agentStartCmd: true },
    take: limit * 3,
  });

  let updated = 0;
  for (const stream of streams) {
    const meta = parseLiveStreamMeta(stream.agentStartCmd);
    if (!meta.autoSyncNameFromEpg || !stream.epgChannelId) continue;

    const program = await prisma.epgProgram.findFirst({
      where: {
        channelId: stream.epgChannelId,
        start: { lte: now },
        stop: { gt: now },
      },
      orderBy: { start: "desc" },
      select: { title: true },
    });
    if (!program?.title?.trim()) continue;

    const title = program.title.trim();
    if (title === stream.name) continue;

    await prisma.stream.update({
      where: { id: stream.id },
      data: { name: title },
    });
    updated += 1;
    if (updated >= limit) break;
  }
  if (updated > 0) {
    const { invalidateXtreamCategories } = await import("./cache-invalidate");
    await invalidateXtreamCategories();
  }
  return updated;
}
