import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enrichVodFromTmdb, isTmdbConfigured } from "@/lib/vod-tmdb-enrich";
import { parseXtreamVodMeta } from "@/lib/vod-meta";
import { cleanTitleForTmdb } from "@/lib/vod-title-clean";
import { stripIntegrationSourceSuffix } from "@/lib/integration-stream-url";

function iconNeedsTmdb(icon: string | null | undefined): boolean {
  const v = String(icon ?? "").trim();
  if (!v) return true;
  if (v.includes("/library/metadata/")) return true;
  if (v.includes("/api/artwork/plex/")) return true;
  return false;
}

function infoNeedsTmdb(cmd: string | null | undefined): boolean {
  const raw = String(cmd ?? "").trim();
  if (!raw) return true;
  const meta = parseXtreamVodMeta(raw);
  return !String(meta.plot ?? meta.tmdbOverview ?? "").trim();
}

export type TmdbVodBackfillResult = {
  movies: number;
  series: number;
  missed: number;
  done: boolean;
};

/**
 * Unique-title TMDB fill: posters (CDN URLs Smarters can load) + plot/cast.
 * One lookup per movie name / series name, then updateMany.
 */
export async function backfillTmdbVodBatch(opts?: {
  movieLimit?: number;
  seriesLimit?: number;
}): Promise<TmdbVodBackfillResult> {
  const movieLimit = Math.min(80, Math.max(0, opts?.movieLimit ?? 40));
  const seriesLimit = Math.min(80, Math.max(0, opts?.seriesLimit ?? 40));
  const result: TmdbVodBackfillResult = { movies: 0, series: 0, missed: 0, done: true };

  if (!(await isTmdbConfigured())) return result;

  if (movieLimit) {
    const movies = await prisma.stream.findMany({
      where: {
        isActive: true,
        type: StreamType.MOVIE,
        OR: [
          { streamIcon: null },
          { streamIcon: "" },
          { streamIcon: { contains: "/library/metadata/" } },
          { streamIcon: { contains: "/api/artwork/plex/" } },
          { agentStartCmd: null },
          { agentStartCmd: "" },
        ],
      },
      select: { id: true, name: true, streamIcon: true, agentStartCmd: true },
      take: movieLimit * 8,
      orderBy: { updatedAt: "asc" },
    });
    const seen = new Set<string>();
    let used = 0;
    for (const row of movies) {
      if (used >= movieLimit) {
        result.done = false;
        break;
      }
      if (!iconNeedsTmdb(row.streamIcon) && !infoNeedsTmdb(row.agentStartCmd)) continue;
      const title = cleanTitleForTmdb(stripIntegrationSourceSuffix(row.name));
      const key = title.toLowerCase();
      if (!key || key.length < 2 || seen.has(key)) continue;
      seen.add(key);
      used++;
      const enrich = await enrichVodFromTmdb(title, "MOVIE");
      if (!enrich) {
        result.missed++;
        continue;
      }
      const updated = await prisma.stream.updateMany({
        where: {
          isActive: true,
          type: StreamType.MOVIE,
          name: row.name,
        },
        data: {
          ...(enrich.streamIcon ? { streamIcon: enrich.streamIcon } : {}),
          agentStartCmd: enrich.agentStartCmd,
        },
      });
      result.movies += updated.count;
    }
    if (movies.length >= movieLimit * 8) result.done = false;
  }

  if (seriesLimit) {
    const episodes = await prisma.stream.findMany({
      where: {
        isActive: true,
        type: StreamType.SERIES,
        OR: [
          { streamIcon: null },
          { streamIcon: "" },
          { streamIcon: { contains: "/library/metadata/" } },
          { streamIcon: { contains: "/api/artwork/plex/" } },
          { agentStartCmd: null },
          { agentStartCmd: "" },
        ],
      },
      select: { id: true, name: true, seriesName: true, streamIcon: true, agentStartCmd: true },
      take: seriesLimit * 20,
      orderBy: { updatedAt: "asc" },
    });
    const seen = new Set<string>();
    let used = 0;
    for (const row of episodes) {
      if (used >= seriesLimit) {
        result.done = false;
        break;
      }
      if (!iconNeedsTmdb(row.streamIcon) && !infoNeedsTmdb(row.agentStartCmd)) continue;
      const show = (row.seriesName?.trim() || row.name).trim();
      const title = cleanTitleForTmdb(stripIntegrationSourceSuffix(show));
      const key = title.toLowerCase();
      if (!key || key.length < 2 || seen.has(key)) continue;
      seen.add(key);
      used++;
      const enrich = await enrichVodFromTmdb(title, "SERIES", show);
      if (!enrich) {
        result.missed++;
        continue;
      }
      const where =
        row.seriesName?.trim()
          ? {
              isActive: true,
              type: StreamType.SERIES,
              seriesName: { equals: row.seriesName, mode: "insensitive" as const },
            }
          : { isActive: true, type: StreamType.SERIES, id: row.id };
      const updated = await prisma.stream.updateMany({
        where,
        data: {
          ...(enrich.streamIcon ? { streamIcon: enrich.streamIcon } : {}),
          agentStartCmd: enrich.agentStartCmd,
        },
      });
      result.series += updated.count;
    }
    if (episodes.length >= seriesLimit * 20) result.done = false;
  }

  return result;
}
