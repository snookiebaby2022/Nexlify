import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rewriteVodAgentCmdForXtream, vodAgentCmdNeedsXtreamRewrite } from "@/lib/vod-meta";
import { enrichVodFromTmdb } from "@/lib/vod-tmdb-enrich";

export async function rewriteStoredVodMetaForXtream(): Promise<number> {
  let updated = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.stream.findMany({
      where: {
        type: { in: [StreamType.MOVIE, StreamType.SERIES] },
        agentStartCmd: { not: null },
        NOT: { agentStartCmd: "" },
      },
      select: { id: true, agentStartCmd: true },
      take: 400,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!rows.length) break;
    for (const row of rows) {
      if (!vodAgentCmdNeedsXtreamRewrite(row.agentStartCmd)) continue;
      const next = rewriteVodAgentCmdForXtream(row.agentStartCmd);
      if (!next) continue;
      await prisma.stream.update({ where: { id: row.id }, data: { agentStartCmd: next } });
      updated++;
    }
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < 400) break;
  }
  return updated;
}

/** TMDB plot/cast for VOD rows that still have no usable agent metadata. */
export async function fillMissingVodInfoFromTmdb(limit = 80): Promise<number> {
  const cap = Math.min(400, Math.max(0, limit));
  if (!cap) return 0;
  const rows = await prisma.stream.findMany({
    where: {
      isActive: true,
      type: { in: [StreamType.MOVIE, StreamType.SERIES] },
      OR: [{ agentStartCmd: null }, { agentStartCmd: "" }],
    },
    select: { id: true, name: true, type: true, seriesName: true },
    orderBy: { type: "asc" },
    take: cap,
  });
  let updated = 0;
  const seenSeries = new Map<string, string>();
  for (const row of rows) {
    try {
      const key =
        row.type === StreamType.SERIES
          ? `s:${(row.seriesName || row.name).toLowerCase()}`
          : `m:${row.name.toLowerCase()}`;
      let cmd = seenSeries.get(key);
      if (!cmd) {
        const enrich = await enrichVodFromTmdb(
          row.name,
          row.type === StreamType.SERIES ? "SERIES" : "MOVIE",
          row.seriesName
        );
        cmd = enrich?.agentStartCmd || "";
        seenSeries.set(key, cmd);
      }
      if (!cmd) continue;
      await prisma.stream.update({ where: { id: row.id }, data: { agentStartCmd: cmd } });
      updated++;
    } catch {
      /* skip */
    }
  }
  return updated;
}
