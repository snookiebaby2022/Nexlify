import fs from "fs";
import path from "path";
import { parseM3u, guessStreamType, parseSeriesFromM3uEntry, type M3uEntry } from "./m3u-parser";
import { prisma } from "./prisma";
import { StreamType, VodMode } from "@prisma/client";
import { resolveProviderUrl } from "./vod-provider-url";
import {
  categoryForMovie,
  categoryForSeries,
  categoryFromFolderPath,
  categoryFromGroupName,
} from "./vod-category";
import { clearTmdbImportCache, enrichVodFromTmdb } from "./vod-tmdb-enrich";
import { encodeImportVodMeta, type VodImportMetaInput } from "./vod-import-meta";
import { getSettingGroup } from "./panel-settings";
import { maxStreamSortOrder } from "./stream-order";
import {
  normalizeStreamMatchKey,
  streamUrlHosts,
} from "./stream-url-match";

const VIDEO_EXT = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".m4v",
  ".ts",
  ".m3u8",
]);

export function resolveSafePath(inputPath: string, allowedRoot?: string) {
  const resolved = path.resolve(inputPath);
  if (!allowedRoot) return resolved;
  const root = path.resolve(allowedRoot);
  if (!resolved.startsWith(root)) {
    throw new Error(`Path must be under ${root}`);
  }
  return resolved;
}

export function fileUrlForPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

export function getMediaImportRoot() {
  return process.env.MEDIA_IMPORT_ROOT ?? "/media";
}

function sanitizeSegment(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").replace(/_+/g, "_").slice(0, 120);
}

export function buildMovieRelativePath(title: string, ext: string) {
  const base = sanitizeSegment(title) || "movie";
  return path.join("movies", `${base}${ext.startsWith(".") ? ext : `.${ext}`}`);
}

export function buildSeriesRelativePath(
  seriesName: string,
  seasonNum: number,
  episodeNum: number,
  ext: string
) {
  const show = sanitizeSegment(seriesName) || "series";
  const season = String(seasonNum).padStart(2, "0");
  const episode = String(episodeNum).padStart(2, "0");
  const suffix = ext.startsWith(".") ? ext : `.${ext}`;
  return path.join(
    "series",
    show,
    `Season ${season}`,
    `${show}.S${season}E${episode}${suffix}`
  );
}

export async function saveMediaFile(
  buffer: Buffer,
  relativePath: string,
  allowedRoot?: string
) {
  const root = allowedRoot ?? getMediaImportRoot();
  const full = path.join(root, relativePath);
  const safe = resolveSafePath(full, root);
  fs.mkdirSync(path.dirname(safe), { recursive: true });
  fs.writeFileSync(safe, buffer);
  return { absolutePath: safe, streamUrl: fileUrlForPath(safe), containerExtension: path.extname(safe).replace(".", "") || "mp4" };
}

import { normalizeStreamSource } from "./stream-source";

export function resolveSourceToStreamUrl(
  source: string,
  allowedRoot?: string
): { streamUrl: string; absolutePath?: string } {
  const s = normalizeStreamSource(source);
  if (/^(https?:\/\/|file:\/\/|rtmp|rtmps|srt|udp):/i.test(s)) {
    return { streamUrl: s };
  }
  // Anything with a scheme — remote URL, not a local path under MEDIA_IMPORT_ROOT
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    return { streamUrl: s };
  }
  const root = allowedRoot ?? getMediaImportRoot();
  const abs = s.startsWith("/") || /^[a-zA-Z]:\\/.test(s)
    ? resolveSafePath(s, root)
    : resolveSafePath(path.join(root, s), root);
  return { streamUrl: fileUrlForPath(abs), absolutePath: abs };
}

function walkVideos(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkVideos(full));
    else if (VIDEO_EXT.has(path.extname(ent.name).toLowerCase())) out.push(full);
  }
  return out;
}

function collectM3uPlaylistFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const st = fs.statSync(root);
  if (st.isFile()) return /\.m3u8?$/i.test(root) ? [root] : [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.m3u8?$/i.test(ent.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

export function parseSeriesFromPath(filePath: string, root: string) {
  const rel = path.relative(root, filePath);
  const parts = rel.split(path.sep);
  if (parts.length >= 3) {
    const seriesName = parts[0];
    const seasonMatch = parts[1].match(/season[\s._-]*(\d+)/i);
    const epMatch = path.basename(filePath).match(/[eE](\d+)|(\d+)x(\d+)/);
    return {
      seriesName,
      seasonNum: seasonMatch ? parseInt(seasonMatch[1], 10) : 1,
      episodeNum: epMatch ? parseInt(epMatch[1] ?? epMatch[3], 10) : 1,
      name: `${seriesName} S${seasonMatch?.[1] ?? "01"}E${epMatch?.[1] ?? epMatch?.[3] ?? "01"}`,
    };
  }
  return null;
}

type VodImportExtras = {
  streamIcon?: string | null;
  agentStartCmd?: string | null;
};

async function resolveVodCategoryAndMeta(opts: {
  type: StreamType;
  explicitCategoryId?: string | null;
  groupOrCategory?: string | null;
  seriesName?: string | null;
  filePath?: string;
  folderRoot?: string;
  displayName: string;
  autoCategory?: boolean;
  autoTmdb?: boolean;
}): Promise<{ categoryId: string | null } & VodImportExtras> {
  let categoryId = opts.explicitCategoryId ?? null;
  let streamIcon: string | null = null;
  let agentStartCmd: string | null = null;

  const vodType = opts.type === "SERIES" ? "SERIES" : "MOVIE";
  let enrichment = null;

  const tmdbSettings = await getSettingGroup("tmdb");
  const tmdbEnabled =
    opts.autoTmdb !== false &&
    (vodType === "MOVIE"
      ? tmdbSettings.enableMovieMeta !== false
      : tmdbSettings.enableSeriesMeta !== false);

  if ((vodType === "MOVIE" || vodType === "SERIES") && tmdbEnabled) {
    enrichment = await enrichVodFromTmdb(
      opts.displayName,
      vodType,
      opts.seriesName
    );
    if (enrichment) {
      streamIcon = enrichment.streamIcon;
      agentStartCmd = enrichment.agentStartCmd;
    }
  }

  const useAutoCategory = opts.autoCategory !== false;

  if (useAutoCategory) {
    // Prefer TMDB genre / path / group over a fixed folder category so imports land in the right genre.
    if (opts.type === "MOVIE" && enrichment?.genreNames[0]) {
      categoryId = await categoryForMovie(enrichment.genreNames[0]);
    } else if (opts.type === "SERIES" && (opts.seriesName || enrichment?.genreNames[0])) {
      categoryId = await categoryForSeries(opts.seriesName, enrichment?.genreNames[0]);
    } else if (opts.groupOrCategory?.trim()) {
      categoryId = await categoryFromGroupName(opts.groupOrCategory, opts.type);
    } else if (opts.filePath && opts.folderRoot) {
      categoryId = await categoryFromFolderPath(
        opts.filePath,
        opts.folderRoot,
        opts.type,
        opts.seriesName
      );
    } else if (opts.type === "SERIES") {
      categoryId = await categoryForSeries(opts.seriesName, enrichment?.genreNames[0]);
    } else if (opts.type === "MOVIE") {
      categoryId = await categoryForMovie(enrichment?.genreNames[0]);
    } else if (opts.explicitCategoryId) {
      categoryId = opts.explicitCategoryId;
    }
  } else if (opts.explicitCategoryId) {
    categoryId = opts.explicitCategoryId;
  }

  return { categoryId, streamIcon, agentStartCmd };
}

type ImportM3uOpts = {
  defaultType?: "LIVE" | "MOVIE" | "SERIES";
  categoryId?: string | null;
  serverId?: string | null;
  /** When true, LIVE channels import as on-demand (default for panel imports). */
  defaultOnDemand?: boolean;
  selectedUrls?: string[];
  autoCategory?: boolean;
  autoTmdb?: boolean;
  importMeta?: VodImportMetaInput;
  bouquetIds?: string[];
  /** Create/attach bouquets from group-title on LIVE imports (default true). */
  autoBouquetFromGroup?: boolean;
  /** First sortOrder for M3U entry index 0 (default 0). */
  sortOrderStart?: number;
  /** When true, update sortOrder on existing streams matched by URL. */
  reorderExisting?: boolean;
  /** When true (default), refresh LIVE stream names/logos/epg ids on sync. */
  updateNamesOnSync?: boolean;
  /** When true (default), move existing matches into the playlist group-title folder. */
  overwriteCategories?: boolean;
};

type ExistingTyped = {
  id: string;
  streamUrl: string;
  name: string;
  streamIcon: string | null;
  epgChannelId: string | null;
  type: StreamType;
  seriesName: string | null;
  seasonNum: number | null;
  episodeNum: number | null;
  categoryId: string | null;
};

const EXISTING_CHUNK = 400;

async function loadExistingByTypeAndUrls(
  type: StreamType,
  urls: string[]
): Promise<{ byExact: Map<string, ExistingTyped>; byNorm: Map<string, ExistingTyped> }> {
  const byExact = new Map<string, ExistingTyped>();
  const byNorm = new Map<string, ExistingTyped>();
  const remember = (row: ExistingTyped) => {
    byExact.set(row.streamUrl, row);
    const key = normalizeStreamMatchKey(row.streamUrl);
    if (key && !byNorm.has(key)) byNorm.set(key, row);
  };

  for (let i = 0; i < urls.length; i += EXISTING_CHUNK) {
    const slice = urls.slice(i, i + EXISTING_CHUNK);
    const rows = await prisma.stream.findMany({
      where: { type, streamUrl: { in: slice } },
      select: {
        id: true,
        streamUrl: true,
        name: true,
        streamIcon: true,
        epgChannelId: true,
        type: true,
        seriesName: true,
        seasonNum: true,
        episodeNum: true,
        categoryId: true,
      },
    });
    for (const row of rows) remember(row);
  }

  for (const host of streamUrlHosts(urls)) {
    const rows = await prisma.stream.findMany({
      where: {
        type,
        streamUrl: { contains: host, mode: "insensitive" },
      },
      select: {
        id: true,
        streamUrl: true,
        name: true,
        streamIcon: true,
        epgChannelId: true,
        type: true,
        seriesName: true,
        seasonNum: true,
        episodeNum: true,
        categoryId: true,
      },
    });
    for (const row of rows) remember(row);
  }

  for (const url of urls) {
    const exact = byExact.get(url);
    if (!exact) continue;
    const key = normalizeStreamMatchKey(url);
    if (key) byNorm.set(key, exact);
  }

  return { byExact, byNorm };
}

function resolveTypedExisting(
  url: string,
  byExact: Map<string, ExistingTyped>,
  byNorm: Map<string, ExistingTyped>
): ExistingTyped | undefined {
  return byExact.get(url) ?? byNorm.get(normalizeStreamMatchKey(url));
}

function emptyImportResult() {
  return {
    imported: 0,
    skipped: 0,
    updated: 0,
    reordered: undefined as number | undefined,
    errors: undefined as string[] | undefined,
  };
}

function mergeImportResults(
  ...parts: Array<{
    imported: number;
    skipped: number;
    updated?: number;
    reordered?: number;
    errors?: string[];
  }>
) {
  const out = emptyImportResult();
  const errors: string[] = [];
  let reordered = 0;
  for (const p of parts) {
    out.imported += p.imported;
    out.skipped += p.skipped;
    out.updated += p.updated ?? 0;
    reordered += p.reordered ?? 0;
    if (p.errors?.length) errors.push(...p.errors);
  }
  out.reordered = reordered || undefined;
  out.errors = errors.length ? errors : undefined;
  return out;
}

async function flushXtreamAfterImport<T extends { imported: number; updated?: number }>(
  result: T,
  vodOnly = false
): Promise<T> {
  if ((result.imported ?? 0) + (result.updated ?? 0) <= 0) return result;
  const { invalidateXtreamCategories, invalidateXtreamVodAndSeriesCatalogs } = await import(
    "./cache-invalidate"
  );
  if (vodOnly) await invalidateXtreamVodAndSeriesCatalogs();
  else await invalidateXtreamCategories();
  return result;
}

export async function importM3uEntries(entries: M3uEntry[], opts: ImportM3uOpts) {
  clearTmdbImportCache();
  const explicitServer = opts.serverId ?? opts.importMeta?.serverIds?.[0] ?? null;
  const { pickVodLoadBalancerId } = await import("@/lib/server-load");
  const vodServerId = explicitServer ?? (await pickVodLoadBalancerId());

  // Fast path for live IPTV playlists (provider get.php / m3u_plus).
  if (opts.defaultType === "LIVE") {
    const { importLiveM3uEntriesFast } = await import("./import-live-m3u");
    return flushXtreamAfterImport(
      await importLiveM3uEntriesFast(entries, {
        categoryId: opts.categoryId,
        serverId: opts.serverId ?? opts.importMeta?.serverIds?.[0] ?? null,
        defaultOnDemand: opts.defaultOnDemand,
        selectedUrls: opts.selectedUrls,
        autoCategory: opts.autoCategory,
        bouquetIds: opts.bouquetIds ?? opts.importMeta?.bouquetIds,
        autoBouquetFromGroup: opts.autoBouquetFromGroup,
        sortOrderStart: opts.sortOrderStart,
        reorderExisting: opts.reorderExisting,
        updateNamesOnSync: opts.updateNamesOnSync,
        overwriteCategories: opts.overwriteCategories,
      })
    );
  }

  // MIXED playlists: route live-looking rows through the normalized LIVE fast path
  // so other providers get the same :443 / /live/ matching as LIVE jobs.
  if (!opts.defaultType) {
    const selectedSet = opts.selectedUrls?.length ? new Set(opts.selectedUrls) : null;
    const liveEntries: M3uEntry[] = [];
    const vodEntries: M3uEntry[] = [];
    for (const entry of entries) {
      if (!entry.url) continue;
      if (selectedSet && !selectedSet.has(entry.url)) continue;
      const kind = guessStreamType(entry);
      if (kind === "LIVE") liveEntries.push(entry);
      else vodEntries.push(entry);
    }
    const { importLiveM3uEntriesFast } = await import("./import-live-m3u");
    const liveResult = liveEntries.length
      ? await importLiveM3uEntriesFast(liveEntries, {
          categoryId: opts.categoryId,
          serverId: opts.serverId ?? opts.importMeta?.serverIds?.[0] ?? null,
          defaultOnDemand: opts.defaultOnDemand ?? true,
          autoCategory: opts.autoCategory,
          bouquetIds: opts.bouquetIds ?? opts.importMeta?.bouquetIds,
          autoBouquetFromGroup: opts.autoBouquetFromGroup,
          sortOrderStart: opts.sortOrderStart,
          reorderExisting: opts.reorderExisting,
          updateNamesOnSync: opts.updateNamesOnSync,
          overwriteCategories: opts.overwriteCategories,
        })
      : emptyImportResult();
    const vodResult = vodEntries.length
      ? await importM3uEntriesTyped(vodEntries, { ...opts, selectedUrls: undefined })
      : emptyImportResult();
    return flushXtreamAfterImport(mergeImportResults(liveResult, vodResult));
  }

  return flushXtreamAfterImport(
    await importM3uEntriesTyped(entries, opts),
    opts.defaultType === "MOVIE" || opts.defaultType === "SERIES"
  );
}

/** MOVIE / SERIES (or remaining VOD rows from MIXED) — normalized URL match + accurate rename counts. */
async function importM3uEntriesTyped(entries: M3uEntry[], opts: ImportM3uOpts) {
  const explicitServer = opts.serverId ?? opts.importMeta?.serverIds?.[0] ?? null;
  const { pickVodLoadBalancerId } = await import("@/lib/server-load");
  const vodServerId = explicitServer ?? (await pickVodLoadBalancerId());
  let imported = 0;
  let skipped = 0;
  let reordered = 0;
  let updated = 0;
  const errors: string[] = [];
  const selectedSet = opts.selectedUrls?.length ? new Set(opts.selectedUrls) : null;
  const bouquetIds = opts.bouquetIds ?? opts.importMeta?.bouquetIds ?? [];
  const sortOrderStart =
    opts.sortOrderStart ??
    (opts.reorderExisting === false ? (await maxStreamSortOrder()) + 1 : 0);

  const filtered = entries.filter((entry) => {
    if (!entry.url) return false;
    if (selectedSet && !selectedSet.has(entry.url)) return false;
    return true;
  });

  // Group by guessed/forced type so we can batch-load existing rows.
  const byType = new Map<StreamType, { entry: M3uEntry; index: number }[]>();
  filtered.forEach((entry, index) => {
    const type = guessStreamType(entry, opts.defaultType) as StreamType;
    const list = byType.get(type) ?? [];
    list.push({ entry, index });
    byType.set(type, list);
  });

  const existingMaps = new Map<
    StreamType,
    { byExact: Map<string, ExistingTyped>; byNorm: Map<string, ExistingTyped> }
  >();
  for (const [type, rows] of byType) {
    existingMaps.set(
      type,
      await loadExistingByTypeAndUrls(
        type,
        rows.map((r) => r.entry.url)
      )
    );
  }

  for (const [type, rows] of byType) {
    const maps = existingMaps.get(type)!;
    for (const { entry, index } of rows) {
      const entrySortOrder = sortOrderStart + index;
      const existing = resolveTypedExisting(entry.url, maps.byExact, maps.byNorm);
      const seriesMeta = type === StreamType.SERIES ? parseSeriesFromM3uEntry(entry) : null;
      if (existing) {
        const wantNames = opts.updateNamesOnSync !== false;
        const nextName = wantNames
          ? (seriesMeta?.displayName || entry.name?.trim() || existing.name).slice(0, 200)
          : null;
        const nextIcon = wantNames ? entry.logo?.trim() || null : null;
        const nextEpg = wantNames
          ? entry.tvgId || entry.tvgName || entry.channelId || null
          : null;
        const urlChanged = existing.streamUrl !== entry.url;
        const nameChanged = Boolean(nextName && nextName !== existing.name);
        const iconChanged = Boolean(
          nextIcon && nextIcon !== (existing.streamIcon ?? null)
        );
        const epgChanged = Boolean(
          nextEpg && nextEpg !== (existing.epgChannelId ?? null)
        );
        const seriesChanged = Boolean(
          seriesMeta &&
            (seriesMeta.seriesName !== (existing.seriesName ?? null) ||
              seriesMeta.seasonNum !== existing.seasonNum ||
              seriesMeta.episodeNum !== existing.episodeNum)
        );
        let nextCategoryId: string | null = null;
        if (opts.overwriteCategories !== false && opts.autoCategory !== false && entry.group?.trim()) {
          nextCategoryId = await categoryFromGroupName(entry.group, type);
        }
        const categoryChanged = Boolean(nextCategoryId && nextCategoryId !== existing.categoryId);
        const metaChanged = nameChanged || iconChanged || epgChanged || seriesChanged || categoryChanged;

        if (opts.reorderExisting !== false || metaChanged || urlChanged) {
          await prisma.stream.update({
            where: { id: existing.id },
            data: {
              sortOrder: entrySortOrder,
              ...(urlChanged ? { streamUrl: entry.url } : {}),
              ...(nameChanged && nextName ? { name: nextName } : {}),
              ...(iconChanged && nextIcon ? { streamIcon: nextIcon } : {}),
              ...(epgChanged && nextEpg ? { epgChannelId: nextEpg } : {}),
              ...(categoryChanged && nextCategoryId ? { categoryId: nextCategoryId } : {}),
              ...(seriesMeta
                ? {
                    seriesName: seriesMeta.seriesName,
                    seasonNum: seriesMeta.seasonNum,
                    episodeNum: seriesMeta.episodeNum,
                  }
                : {}),
            },
          });
          if (bouquetIds.length) {
            for (const bouquetId of bouquetIds) {
              await prisma.bouquetStream.upsert({
                where: { bouquetId_streamId: { bouquetId, streamId: existing.id } },
                create: { bouquetId, streamId: existing.id, sortOrder: entrySortOrder },
                update: { sortOrder: entrySortOrder },
              });
            }
          }
          if (type === StreamType.MOVIE || type === StreamType.SERIES) {
            const { ensureIptvVodBouquetMembership } = await import("./integration-bouquet");
            await ensureIptvVodBouquetMembership(existing.id, type, entrySortOrder);
          }
          reordered++;
        }
        if (metaChanged) updated++;
        skipped++;
        continue;
      }

      const meta =
        type === StreamType.MOVIE || type === StreamType.SERIES
          ? await resolveVodCategoryAndMeta({
              type,
              explicitCategoryId: opts.categoryId,
              groupOrCategory: entry.group,
              seriesName: seriesMeta?.seriesName ?? (type === StreamType.SERIES ? entry.name : null),
              displayName: seriesMeta?.displayName || entry.name,
              autoCategory: opts.autoCategory,
              autoTmdb: opts.autoTmdb,
            })
          : {
              categoryId:
                opts.categoryId ??
                (entry.group ? await categoryFromGroupName(entry.group, type) : null),
              streamIcon: entry.logo ?? null,
              agentStartCmd: null,
            };

      const agentStartCmd =
        type === "MOVIE" || type === "SERIES"
          ? encodeImportVodMeta(opts.importMeta ?? {}, meta.agentStartCmd)
          : meta.agentStartCmd;

      const onDemand = type === "LIVE" ? false : true;
      const liveAgentStartCmd =
        type === "LIVE" && !onDemand
          ? (await import("@/lib/stream-live-meta")).encodeLiveStreamMeta({
              redirectStream: false,
            })
          : meta.agentStartCmd;
      try {
        const stream = await prisma.stream.create({
          data: {
            name: seriesMeta?.displayName || entry.name,
            streamUrl: entry.url,
            streamIcon: meta.streamIcon ?? entry.logo ?? null,
            type,
            sortOrder: entrySortOrder,
            categoryId: meta.categoryId,
            serverId: type === "LIVE" ? explicitServer : vodServerId,
            epgChannelId: entry.tvgId || entry.tvgName || entry.channelId || null,
            seriesName:
              seriesMeta?.seriesName ?? (type === StreamType.SERIES ? entry.name : null),
            seasonNum: seriesMeta?.seasonNum ?? null,
            episodeNum: seriesMeta?.episodeNum ?? null,
            agentStartCmd: type === "LIVE" ? liveAgentStartCmd : agentStartCmd,
            isOnDemand: onDemand,
            vodMode: onDemand ? VodMode.ON_DEMAND : VodMode.LIVE,
            autoRestart: onDemand,
            isAdult: opts.importMeta?.isAdult === true,
          },
        });
        if (bouquetIds.length) {
          await prisma.bouquetStream.createMany({
            data: bouquetIds.map((bouquetId) => ({
              bouquetId,
              streamId: stream.id,
              sortOrder: entrySortOrder,
            })),
            skipDuplicates: true,
          });
        }
        if (type === StreamType.MOVIE || type === StreamType.SERIES) {
          const { ensureIptvVodBouquetMembership } = await import("./integration-bouquet");
          await ensureIptvVodBouquetMembership(stream.id, type, entrySortOrder);
        }
        imported++;
      } catch (e) {
        errors.push(`${entry.name}: ${e instanceof Error ? e.message : "failed"}`);
        skipped++;
      }
    }
  }

  return {
    imported,
    skipped,
    reordered: reordered || undefined,
    updated,
    errors: errors.length ? errors : undefined,
  };
}

export async function importFromM3uContent(
  content: string,
  opts: Parameters<typeof importM3uEntries>[1]
) {
  const entries = parseM3u(content);
  return importM3uEntries(entries, opts);
}

export async function importFromFolder(
  folderPath: string,
  opts: {
    mode: "MOVIE" | "SERIES" | "MIXED";
    categoryId?: string | null;
    serverId?: string | null;
    allowedRoot?: string;
    isAdult?: boolean;
  }
) {
  clearTmdbImportCache();
  const safe = resolveSafePath(folderPath, opts.allowedRoot ?? process.env.MEDIA_IMPORT_ROOT);
  let imported = 0;
  let skipped = 0;
  const isAdult = opts.isAdult === true;
  const { pickVodLoadBalancerId } = await import("@/lib/server-load");
  const folderServerId = opts.serverId ?? (await pickVodLoadBalancerId());

  const m3uFiles = collectM3uPlaylistFiles(safe);
  for (const m3uFile of m3uFiles) {
    const content = fs.readFileSync(m3uFile, "utf8");
    const r = await importFromM3uContent(content, {
      defaultType: opts.mode === "SERIES" ? "SERIES" : opts.mode === "MOVIE" ? "MOVIE" : undefined,
      categoryId: opts.categoryId,
      serverId: folderServerId,
      importMeta: isAdult ? { isAdult: true } : undefined,
    });
    imported += r.imported;
    skipped += r.skipped;
  }

  const videos = walkVideos(safe).filter((f) => !f.endsWith(".m3u") && !f.endsWith(".m3u8"));

  for (const file of videos) {
    const url = fileUrlForPath(file);
    const series = parseSeriesFromPath(file, safe);
    const type =
      opts.mode === "SERIES"
        ? StreamType.SERIES
        : opts.mode === "MOVIE"
          ? StreamType.MOVIE
          : series
            ? StreamType.SERIES
            : StreamType.MOVIE;

    const name = series?.name ?? path.basename(file, path.extname(file));
    const exists = await prisma.stream.findFirst({ where: { streamUrl: url } });
    if (exists) {
      skipped++;
      continue;
    }

    const meta = await resolveVodCategoryAndMeta({
      type,
      explicitCategoryId: opts.categoryId,
      seriesName: series?.seriesName,
      filePath: file,
      folderRoot: safe,
      displayName: name,
    });

    try {
      await prisma.stream.create({
        data: {
          name,
          streamUrl: url,
          streamIcon: meta.streamIcon,
          type,
          categoryId: meta.categoryId,
          serverId: folderServerId,
          seriesName: series?.seriesName,
          seasonNum: series?.seasonNum,
          episodeNum: series?.episodeNum,
          containerExtension: path.extname(file).replace(".", "") || "mp4",
          agentStartCmd: meta.agentStartCmd,
          isOnDemand: true,
          vodMode: VodMode.ON_DEMAND,
          isAdult,
        },
      });
      imported++;
    } catch (err) {
      console.warn(`[import] Failed to import ${file}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return flushXtreamAfterImport({ imported, skipped }, true);
}

export async function importFromVodRows(
  rows: import("./vod-import-parser").VodImportRow[],
  opts: {
    defaultType: "MOVIE" | "SERIES";
    categoryId?: string | null;
    serverId?: string | null;
    allowedRoot?: string;
  }
) {
  clearTmdbImportCache();
  const root = opts.allowedRoot ?? getMediaImportRoot();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const { pickVodLoadBalancerId } = await import("@/lib/server-load");
  const defaultServerId = opts.serverId ?? (await pickVodLoadBalancerId());

  for (const row of rows) {
    try {
      let streamUrl = "";
      let providerId: string | null = null;
      let providerPath: string | null = null;
      let hostedExternally = Boolean(row.hosted_externally);

      if (row.provider_id && row.provider_path) {
        const provider = await prisma.streamProvider.findUnique({ where: { id: row.provider_id } });
        if (!provider) {
          errors.push(`${row.name}: provider not found`);
          skipped++;
          continue;
        }
        streamUrl = resolveProviderUrl(provider, row.provider_path);
        providerId = provider.id;
        providerPath = row.provider_path;
        hostedExternally = true;
      } else {
        const resolved = resolveSourceToStreamUrl(row.source, root);
        streamUrl = resolved.streamUrl;
      }
      const type =
        opts.defaultType === "SERIES" || row.series_name
          ? StreamType.SERIES
          : StreamType.MOVIE;

      const existing = await prisma.stream.findFirst({ where: { streamUrl, type } });
      if (existing) {
        skipped++;
        continue;
      }

      const meta = await resolveVodCategoryAndMeta({
        type,
        explicitCategoryId: opts.categoryId,
        groupOrCategory: row.category,
        seriesName: row.series_name,
        displayName: row.name,
      });

      const ext =
        row.container_extension ??
        (streamUrl.startsWith("file://")
          ? path.extname(streamUrl.replace(/^file:\/\//, "")).replace(".", "")
          : "mp4");

      await prisma.stream.create({
        data: {
          name: row.name,
          streamUrl,
          streamIcon: meta.streamIcon ?? row.stream_icon ?? null,
          type,
          categoryId: meta.categoryId,
          serverId: defaultServerId,
          seriesName: type === StreamType.SERIES ? row.series_name ?? row.name : null,
          seasonNum: type === StreamType.SERIES ? row.season_num ?? 1 : null,
          episodeNum: type === StreamType.SERIES ? row.episode_num ?? 1 : null,
          containerExtension: ext || "mp4",
          providerId,
          providerPath,
          hostedExternally,
          agentStartCmd: meta.agentStartCmd,
          isOnDemand: true,
          vodMode: VodMode.ON_DEMAND,
        },
      });
      imported++;
    } catch (e) {
      errors.push(`${row.name}: ${e instanceof Error ? e.message : "failed"}`);
      skipped++;
    }
  }

  return flushXtreamAfterImport({ imported, skipped, errors }, true);
}
