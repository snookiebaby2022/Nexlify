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
import { plexArtworkUrl } from "@/lib/plex-artwork";
import { parseIntegrationStreamUrl, stripIntegrationSourceSuffix } from "@/lib/integration-stream-url";
import { resolveServerUrls } from "@/lib/server-urls";
import type { ArtworkFillReporter } from "@/lib/artwork-fill-types";

const MISSING_ICON: Prisma.StreamWhereInput = {
  OR: [{ streamIcon: null }, { streamIcon: "" }],
};

const STALE_PLEX_ICON: Prisma.StreamWhereInput = {
  streamIcon: { contains: "/library/metadata/", mode: "insensitive" },
};

export type ArtworkFillResult = {
  scanned: number;
  updated: number;
  fromProvider: number;
  fromPlex: number;
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

function needsPlexProxyIcon(streamUrl: string, streamIcon: string | null): boolean {
  const parsed = parseIntegrationStreamUrl(streamUrl);
  if (!parsed || parsed.type !== "plex") return false;
  const icon = String(streamIcon ?? "").trim();
  if (!icon) return true;
  if (icon.includes("/library/metadata/")) return true;
  if (!icon.includes("/api/artwork/plex/")) return true;
  return false;
}

/** Point Plex integration rows at the panel artwork proxy. */
export async function backfillPlexArtworkIcons(opts?: {
  reporter?: ArtworkFillReporter;
  origin?: string | null;
}): Promise<number> {
  let artworkOrigin = opts?.origin?.replace(/\/$/, "") ?? "";
  if (!artworkOrigin) {
    try {
      artworkOrigin = (await resolveServerUrls()).serverUrl.replace(/\/$/, "");
    } catch {
      artworkOrigin = String(process.env.NEXT_PUBLIC_SERVER_URL ?? "").replace(/\/$/, "");
    }
  }

  const rows = await prisma.stream.findMany({
    where: { isActive: true, streamUrl: { startsWith: "nexlify://plex/" } },
    select: { id: true, streamUrl: true, streamIcon: true },
    orderBy: { id: "asc" },
  });

  await opts?.reporter?.counts({ total: rows.length, current: 0 });
  let updated = 0;
  let n = 0;
  const pending: { id: string; streamIcon: string }[] = [];

  const flush = async () => {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    await writeIcons(batch);
    updated += batch.length;
    await opts?.reporter?.counts({ current: n, updated: (opts.reporter.snapshot().updated ?? 0) + batch.length });
  };

  for (const row of rows) {
    n++;
    if (opts?.reporter?.isCancelled()) break;
    const parsed = parseIntegrationStreamUrl(row.streamUrl);
    if (!parsed || parsed.type !== "plex") continue;
    if (!needsPlexProxyIcon(row.streamUrl, row.streamIcon)) continue;
    const next = plexArtworkUrl(parsed.integrationId, parsed.itemId, artworkOrigin);
    if (row.streamIcon === next) continue;
    pending.push({ id: row.id, streamIcon: next });
    if (pending.length >= 40) await flush();
    if (n % 250 === 0 || n === rows.length) {
      await opts?.reporter?.note(`Plex posters ${n.toLocaleString()}/${rows.length.toLocaleString()}…`, {
        current: n,
        total: rows.length,
      });
    }
  }
  await flush();
  await opts?.reporter?.counts({ fromPlex: updated, updated: (opts.reporter.snapshot().updated ?? 0) + updated });
  return updated;
}

/** Copy show posters onto episodes that still have no icon. */
async function copySeriesCovers(
  where: Prisma.StreamWhereInput,
  reporter?: ArtworkFillReporter
): Promise<number> {
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
    const key = stripIntegrationSourceSuffix(s.seriesName?.trim() || s.name).toLowerCase();
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
    if (reporter?.isCancelled()) break;
    const key = stripIntegrationSourceSuffix(ep.seriesName?.trim() || ep.name).toLowerCase();
    const icon = cover.get(key);
    if (icon) updates.push({ id: ep.id, streamIcon: icon });
  }
  await writeIcons(updates);
  return updates.length;
}

function streamTypesFromFilter(types?: StreamType[]): StreamType[] {
  return types?.length ? types : [StreamType.LIVE, StreamType.MOVIE, StreamType.SERIES];
}

async function countRemaining(types: StreamType[], extraWhere: Prisma.StreamWhereInput): Promise<number> {
  return prisma.stream.count({
    where: {
      isActive: true,
      AND: [MISSING_ICON, extraWhere, { type: { in: types } }],
    },
  });
}

/**
 * Fill missing streamIcon from Plex proxy, IPTV provider catalogs, series covers, then TMDB.
 * Provider matches are unbounded; TMDB is capped to stay under rate limits.
 */
export async function fillMissingStreamArtwork(opts?: {
  where?: Prisma.StreamWhereInput;
  types?: StreamType[];
  tmdbLimit?: number;
  liveLogoLimit?: number;
  includePlexBackfill?: boolean;
  reporter?: ArtworkFillReporter;
}): Promise<ArtworkFillResult> {
  const extraWhere = { ...(opts?.where ?? {}) } as Prisma.StreamWhereInput & { type?: unknown };
  const typeFromWhere = extraWhere.type;
  delete extraWhere.type;
  const types = streamTypesFromFilter(opts?.types?.length ? opts.types : typeof typeFromWhere === "string" ? [typeFromWhere as StreamType] : undefined);
  const tmdbLimit = Math.min(2000, Math.max(0, opts?.tmdbLimit ?? 300));
  const liveLogoLimit = Math.min(200, Math.max(0, opts?.liveLogoLimit ?? 40));
  const tmdbOk = await isTmdbConfigured();
  const reporter = opts?.reporter;

  let scanned = 0;
  let fromProvider = 0;
  let fromPlex = 0;
  let fromTmdb = 0;
  let fromLiveLogo = 0;

  const remainingStart = await countRemaining(types, extraWhere);
  await reporter?.counts({ total: remainingStart, tmdbConfigured: tmdbOk });

  if (opts?.includePlexBackfill !== false && (types.includes(StreamType.MOVIE) || types.includes(StreamType.SERIES))) {
    await reporter?.step("plex", "Linking Plex titles to panel poster proxy…");
    fromPlex = await backfillPlexArtworkIcons({ reporter });
    await reporter?.counts({ fromPlex: (reporter?.snapshot().fromPlex ?? 0) + fromPlex });
  }

  for (const type of types) {
    if (reporter?.isCancelled()) break;
    const kind: RemoteKind = type === StreamType.MOVIE ? "MOVIE" : type === StreamType.SERIES ? "SERIES" : "LIVE";
    await reporter?.step("provider", `Matching ${type.toLowerCase()} titles to IPTV provider posters…`);
    const index = await loadProviderArtworkIndex(kind);
    const batch = await loadMissing({ type, ...extraWhere }, 50_000);
    scanned += batch.length;
    const updates: { id: string; streamIcon: string }[] = [];
    let n = 0;
    for (const row of batch) {
      n++;
      if (reporter?.isCancelled()) break;
      const icon = pickProviderArtwork(index, row);
      if (icon) updates.push({ id: row.id, streamIcon: icon });
      if (n % 500 === 0) {
        await reporter?.note(`IPTV catalog ${n.toLocaleString()}/${batch.length.toLocaleString()} (${type})…`, {
          current: n,
        });
      }
    }
    await writeIcons(updates);
    fromProvider += updates.length;
    await reporter?.counts({
      fromProvider: (reporter?.snapshot().fromProvider ?? 0) + updates.length,
      updated: (reporter?.snapshot().updated ?? 0) + updates.length,
    });
  }

  let fromSeriesCover = 0;
  if (types.includes(StreamType.SERIES)) {
    await reporter?.step("series", "Copying show posters to episodes…");
    fromSeriesCover = await copySeriesCovers(extraWhere, reporter);
    await reporter?.counts({
      fromSeriesCover: (reporter?.snapshot().fromSeriesCover ?? 0) + fromSeriesCover,
      updated: (reporter?.snapshot().updated ?? 0) + fromSeriesCover,
    });
  }

  if (tmdbOk && tmdbLimit > 0) {
    const vodTypes = types.filter((t) => t === StreamType.MOVIE || t === StreamType.SERIES);
    let used = 0;
    for (const type of vodTypes) {
      if (used >= tmdbLimit || reporter?.isCancelled()) break;
      await reporter?.step("tmdb", `TMDB lookup for ${type.toLowerCase()}…`);
      const leftover = await loadMissing({ type, ...extraWhere }, tmdbLimit - used);
      const updates: { id: string; streamIcon: string; agentStartCmd?: string }[] = [];
      let batchUpdated = 0;
      for (const row of leftover) {
        used++;
        if (reporter?.isCancelled()) break;
        try {
          const title = stripIntegrationSourceSuffix(row.seriesName?.trim() || row.name);
          const enrich = await enrichVodFromTmdb(
            title,
            type === StreamType.SERIES ? "SERIES" : "MOVIE",
            row.seriesName
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
        if (updates.length >= 25) {
          await writeIcons(updates.splice(0, updates.length));
          batchUpdated += 25;
          await reporter?.note(`TMDB ${used.toLocaleString()} / ${tmdbLimit} (${type})…`, { current: used });
        }
      }
      if (updates.length) {
        await writeIcons(updates);
        batchUpdated += updates.length;
      }
      fromTmdb += batchUpdated;
      await reporter?.counts({
        fromTmdb: (reporter?.snapshot().fromTmdb ?? 0) + updates.length,
        updated: (reporter?.snapshot().updated ?? 0) + updates.length,
        current: used,
      });
    }
  }

  if (types.includes(StreamType.LIVE) && liveLogoLimit > 0) {
    await reporter?.step("live", "Auto-fetching live channel logos…");
    const leftover = await loadMissing({ type: StreamType.LIVE, ...extraWhere }, liveLogoLimit);
    for (const row of leftover) {
      if (reporter?.isCancelled()) break;
      try {
        const logo = await applyAutoLogoToStream(row.id);
        if (logo) fromLiveLogo++;
      } catch {
        /* skip */
      }
    }
    await reporter?.counts({
      fromLiveLogo: (reporter?.snapshot().fromLiveLogo ?? 0) + fromLiveLogo,
      updated: (reporter?.snapshot().updated ?? 0) + fromLiveLogo,
    });
  }

  const remaining = await countRemaining(types, extraWhere);
  const updated = fromProvider + fromPlex + fromSeriesCover + fromTmdb + fromLiveLogo;

  return {
    scanned,
    updated,
    fromProvider,
    fromPlex,
    fromSeriesCover,
    fromTmdb,
    fromLiveLogo,
    remaining,
    tmdbConfigured: tmdbOk,
  };
}

/** Count streams missing artwork for the progress bar total. */
export async function countArtworkFillTargets(types: StreamType[]): Promise<number> {
  const missing = await prisma.stream.count({
    where: { isActive: true, AND: [MISSING_ICON, { type: { in: types } }] },
  });
  const plexStale = await prisma.stream.count({
    where: {
      isActive: true,
      streamUrl: { startsWith: "nexlify://plex/" },
      AND: [STALE_PLEX_ICON],
    },
  });
  return missing + plexStale;
}
