import { StreamType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  loadProviderArtworkIndex,
  pickProviderArtwork,
  type RemoteKind,
} from "@/lib/provider-remote-catalog";
import { enrichVodFromTmdb, isTmdbConfigured } from "@/lib/vod-tmdb-enrich";
import { applyAutoLogoToStream } from "@/lib/channel-logo";
import { vodAgentCmdNeedsXtreamRewrite } from "@/lib/vod-meta";

const MISSING_ICON: Prisma.StreamWhereInput = {
  OR: [{ streamIcon: null }, { streamIcon: "" }],
};

export type ArtworkFillResult = {
  scanned: number;
  updated: number;
  fromProvider: number;
  fromSeriesCover: number;
  fromTmdb: number;
  fromLiveLogo: number;
  remaining: number;
  tmdbConfigured: boolean;
};

type MissingRow = {
  id: string;
  name: string;
  type: StreamType;
  seriesName: string | null;
  providerId: string | null;
  providerPath: string | null;
  streamUrl: string;
  agentStartCmd: string | null;
};

async function writeIcons(rows: { id: string; streamIcon: string; agentStartCmd?: string }[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await prisma.$transaction(
      chunk.map((row) =>
        prisma.stream.update({
          where: { id: row.id },
          data: {
            streamIcon: row.streamIcon,
            ...(row.agentStartCmd ? { agentStartCmd: row.agentStartCmd } : {}),
          },
        })
      )
    );
  }
}

async function loadMissing(where: Prisma.StreamWhereInput, take: number): Promise<MissingRow[]> {
  return prisma.stream.findMany({
    where: { isActive: true, AND: [MISSING_ICON, where] },
    select: {
      id: true,
      name: true,
      type: true,
      seriesName: true,
      providerId: true,
      providerPath: true,
      streamUrl: true,
      agentStartCmd: true,
    },
    orderBy: { id: "asc" },
    take,
  });
}

/** Copy show posters onto episodes that still have no icon. */
async function copySeriesCovers(where: Prisma.StreamWhereInput): Promise<number> {
  const seeds = await prisma.stream.findMany({
    where: {
      isActive: true,
      type: StreamType.SERIES,
      AND: [
        { OR: [{ episodeNum: null }, { episodeNum: 0 }] },
        { streamIcon: { not: "" } },
        { streamIcon: { not: null } },
      ],
    },
    select: { seriesName: true, name: true, streamIcon: true },
    take: 20_000,
  });
  const cover = new Map<string, string>();
  for (const s of seeds) {
    const key = (s.seriesName?.trim() || s.name).toLowerCase();
    const icon = s.streamIcon?.trim();
    if (key && icon && !cover.has(key)) cover.set(key, icon);
  }
  if (!cover.size) return 0;

  const episodes = await prisma.stream.findMany({
    where: {
      isActive: true,
      type: StreamType.SERIES,
      episodeNum: { gt: 0 },
      AND: [MISSING_ICON, where],
    },
    select: { id: true, seriesName: true, name: true },
    take: 50_000,
  });
  const updates: { id: string; streamIcon: string }[] = [];
  for (const ep of episodes) {
    const key = (ep.seriesName?.trim() || ep.name).toLowerCase();
    const icon = cover.get(key);
    if (icon) updates.push({ id: ep.id, streamIcon: icon });
  }
  await writeIcons(updates);
  return updates.length;
}

/**
 * Fill missing streamIcon from IPTV provider catalogs first, then TMDB.
 * Provider matches are unbounded; TMDB is capped to stay under rate limits.
 */
export async function fillMissingStreamArtwork(opts?: {
  where?: Prisma.StreamWhereInput;
  types?: StreamType[];
  tmdbLimit?: number;
  liveLogoLimit?: number;
}): Promise<ArtworkFillResult> {
  const extraWhere = { ...(opts?.where ?? {}) } as Prisma.StreamWhereInput & { type?: unknown };
  const typeFromWhere = extraWhere.type;
  delete extraWhere.type;
  const types = opts?.types?.length
    ? opts.types
    : typeof typeFromWhere === "string"
      ? [typeFromWhere as StreamType]
      : [StreamType.LIVE, StreamType.MOVIE, StreamType.SERIES];
  const tmdbLimit = Math.min(2000, Math.max(0, opts?.tmdbLimit ?? 300));
  const liveLogoLimit = Math.min(200, Math.max(0, opts?.liveLogoLimit ?? 40));
  const tmdbOk = await isTmdbConfigured();

  let scanned = 0;
  let fromProvider = 0;
  let fromTmdb = 0;
  let fromLiveLogo = 0;

  for (const type of types) {
    const kind: RemoteKind = type === StreamType.MOVIE ? "MOVIE" : type === StreamType.SERIES ? "SERIES" : "LIVE";
    const index = await loadProviderArtworkIndex(kind);
    const batch = await loadMissing({ type, ...extraWhere }, 50_000);
    scanned += batch.length;
    const updates: { id: string; streamIcon: string }[] = [];
    for (const row of batch) {
      const icon = pickProviderArtwork(index, row);
      if (icon) updates.push({ id: row.id, streamIcon: icon });
    }
    await writeIcons(updates);
    fromProvider += updates.length;
  }

  const fromSeriesCover = types.includes(StreamType.SERIES) ? await copySeriesCovers(extraWhere) : 0;

  if (tmdbOk && tmdbLimit > 0) {
    const vodTypes = types.filter((t) => t === StreamType.MOVIE || t === StreamType.SERIES);
    let used = 0;
    for (const type of vodTypes) {
      if (used >= tmdbLimit) break;
      const leftover = await loadMissing({ type, ...extraWhere }, tmdbLimit - used);
      const updates: { id: string; streamIcon: string; agentStartCmd?: string }[] = [];
      for (const row of leftover) {
        try {
          const enrich = await enrichVodFromTmdb(
            row.seriesName?.trim() || row.name,
            type === StreamType.SERIES ? "SERIES" : "MOVIE"
          );
          if (!enrich?.streamIcon) continue;
          updates.push({
            id: row.id,
            streamIcon: enrich.streamIcon,
            agentStartCmd:
              !row.agentStartCmd || vodAgentCmdNeedsXtreamRewrite(row.agentStartCmd)
                ? enrich.agentStartCmd || undefined
                : undefined,
          });
        } catch {
          /* skip */
        }
      }
      await writeIcons(updates);
      fromTmdb += updates.length;
      used += leftover.length;
    }
  }

  if (types.includes(StreamType.LIVE) && liveLogoLimit > 0) {
    const leftover = await loadMissing({ type: StreamType.LIVE, ...extraWhere }, liveLogoLimit);
    for (const row of leftover) {
      try {
        const logo = await applyAutoLogoToStream(row.id);
        if (logo) fromLiveLogo++;
      } catch {
        /* skip */
      }
    }
  }

  const remaining = await prisma.stream.count({
    where: {
      isActive: true,
      AND: [MISSING_ICON, extraWhere, { type: { in: types } }],
    },
  });

  return {
    scanned,
    updated: fromProvider + fromSeriesCover + fromTmdb + fromLiveLogo,
    fromProvider,
    fromSeriesCover,
    fromTmdb,
    fromLiveLogo,
    remaining,
    tmdbConfigured: tmdbOk,
  };
}
