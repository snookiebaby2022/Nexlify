import { prisma } from "@/lib/prisma";
import { encodeLiveStreamMeta, parseLiveStreamMeta } from "@/lib/stream-live-meta";
import { isGarbageStreamName, isUsefulNowPlayingTitle } from "@/lib/stream-catalog-name";

/** Store now-playing / fixture title in live meta. Never rename the catalog stream.name. */
export async function syncStreamNamesFromEpg(limit = 40): Promise<number> {
  const now = new Date();
  const streams = await prisma.stream.findMany({
    where: {
      type: "LIVE",
      isActive: true,
      epgChannelId: { not: null },
    },
    select: { id: true, name: true, epgChannelId: true, agentStartCmd: true, channelId: true },
    take: limit * 4,
  });

  let updated = 0;
  for (const stream of streams) {
    const meta = parseLiveStreamMeta(stream.agentStartCmd);
    const program = stream.epgChannelId
      ? await prisma.epgProgram.findFirst({
          where: {
            channelId: stream.epgChannelId,
            start: { lte: now },
            stop: { gt: now },
          },
          orderBy: { start: "desc" },
          select: { title: true },
        })
      : null;

    const nowPlaying = isUsefulNowPlayingTitle(program?.title) ? program!.title.trim() : "";
    const catalogName = !isGarbageStreamName(stream.name)
      ? stream.name
      : typeof meta.raw?.catalogName === "string" && !isGarbageStreamName(String(meta.raw.catalogName))
        ? String(meta.raw.catalogName)
        : stream.channelId?.trim()
          ? `Channel ${stream.channelId}`
          : stream.name;

    const nextMeta = encodeLiveStreamMeta({
      ...(meta.raw ?? {}),
      catalogName,
      nowPlayingTitle: nowPlaying || null,
      nowPlayingAt: nowPlaying ? now.toISOString() : null,
    });

    const nameFix = isGarbageStreamName(stream.name) && catalogName !== stream.name;
    if (nameFix || nextMeta !== (stream.agentStartCmd ?? "")) {
      await prisma.stream.update({
        where: { id: stream.id },
        data: {
          ...(nameFix ? { name: catalogName } : {}),
          agentStartCmd: nextMeta,
        },
      });
      updated += 1;
      if (updated >= limit) break;
    }
  }
  return updated;
}
