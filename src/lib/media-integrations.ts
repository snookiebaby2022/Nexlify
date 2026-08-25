import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma, StreamType } from "@prisma/client";
import {
  fetchPlexJson,
  pickPlexPlaybackUrl,
  resolvePlexProfile,
  type PlexJsonMetadata,
} from "@/lib/plex-playback";
import { buildIntegrationStreamUrl, parseIntegrationStreamUrl, stripIntegrationSourceSuffix } from "@/lib/integration-stream-url";
import { plexArtworkUrl } from "@/lib/plex-artwork";
import {
  attachVodBouquetsToAllLines,
  ensurePluginImportBouquetId,
  ensureVodBouquetId,
  findPluginImportBouquetId,
  linkStreamToVodBouquet,
  relinkPlexStreamsToVodBouquets,
} from "@/lib/integration-bouquet";
import { maxStreamSortOrder } from "@/lib/stream-order";
import { resolveServerUrls } from "@/lib/server-urls";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import {
  buildPlexBaseUrl,
  extractPlexToken,
  normalizePlexConfig,
  plexClientIdentifier,
  plexTokenParam,
  signInPlexTv,
  type PlexIntegrationConfig,
} from "@/lib/plex-config";
import type { IntegrationSyncReporter } from "@/lib/integration-sync-progress";
import { loadPlexCatalogIndex, plexCatalogTitleKey, plexGenreName, plexVodMetaFromItem } from "@/lib/plex-catalog-match";
import { categoryForPlexMovie, categoryForPlexSeries } from "@/lib/vod-category";
import { encodeVodAgentCmd, parseVodAgentCmd } from "@/lib/vod-meta";
import { encodeVodAgentCmd } from "@/lib/vod-meta";

export async function listIntegrations(type: "plex" | "youtube") {
  return prisma.mediaIntegration.findMany({
    where: { type },
    orderBy: { createdAt: "desc" },
  });
}

type PlexSectionResponse = {
  MediaContainer?: { Directory?: { key: string; title?: string; type?: string }[] };
};

type PlexItemMeta = {
  ratingKey?: string;
  key?: string;
  title?: string;
  type?: string;
  thumb?: string;
  grandparentThumb?: string;
  grandparentTitle?: string;
  parentTitle?: string;
  parentIndex?: number;
  index?: number;
  summary?: string;
  year?: number | string;
  rating?: number | string;
  audienceRating?: number | string;
  originallyAvailableAt?: string;
  duration?: number;
  studio?: string;
  Genre?: unknown;
  Role?: unknown;
  Director?: unknown;
};

type PlexItemsResponse = {
  MediaContainer?: {
    size?: number;
    totalSize?: number;
    Metadata?: PlexItemMeta[];
  };
};

type PlexAccess = {
  cfg: PlexIntegrationConfig;
  base: string;
  token: string;
  clientIdentifier: string;
};

async function persistPlexConfig(integrationId: string, cfg: PlexIntegrationConfig) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row) return;
  const prev = row.config && typeof row.config === "object" ? { ...(row.config as Record<string, unknown>) } : {};
  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: {
      config: {
        ...prev,
        ...cfg,
        token: cfg.token,
        host: cfg.host,
        port: cfg.port,
        protocol: cfg.protocol,
        clientIdentifier: cfg.clientIdentifier,
      } as Prisma.InputJsonValue,
    },
  });
}

async function plexSectionsOrThrow(base: string, cfg: PlexIntegrationConfig, clientIdentifier: string) {
  return fetchPlexJson<PlexSectionResponse>(
    `${base}/library/sections?${plexTokenParam(cfg)}`,
    clientIdentifier
  );
}

export async function ensurePlexAccess(integrationId: string): Promise<PlexAccess> {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "plex") throw new Error("Plex integration not found");
  const cfg = normalizePlexConfig((row.config ?? {}) as Record<string, unknown>);
  const base = buildPlexBaseUrl(cfg);
  if (!base) throw new Error("Plex host and port are required");

  let clientIdentifier = plexClientIdentifier(cfg);
  if (clientIdentifier === "nexlify-panel") {
    clientIdentifier = `nexlify-panel-${randomUUID()}`;
    cfg.clientIdentifier = clientIdentifier;
  } else {
    cfg.clientIdentifier = clientIdentifier;
  }

  let token = extractPlexToken(String(cfg.token ?? ""));
  const username = String(cfg.username ?? "").trim();
  const password = String(cfg.password ?? "");

  if (!token && username && password) {
    token = await signInPlexTv(username, password, clientIdentifier);
  }
  if (!token) throw new Error("Plex token required (or username and password to sign in)");
  cfg.token = token;

  const trySections = async () => plexSectionsOrThrow(base, cfg, clientIdentifier);

  try {
    await trySections();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/401/.test(msg) && username && password) {
      token = await signInPlexTv(username, password, clientIdentifier);
      cfg.token = token;
      await trySections();
    } else {
      throw e;
    }
  }

  await persistPlexConfig(integrationId, cfg);
  return { cfg, base, token, clientIdentifier };
}

export async function testPlexConnection(integrationId: string) {
  const access = await ensurePlexAccess(integrationId);
  const identity = await fetchPlexJson<{
    MediaContainer?: { machineIdentifier?: string; version?: string; claimed?: boolean };
  }>(`${access.base}/identity?${plexTokenParam(access.cfg)}`, access.clientIdentifier).catch(() => null);
  const sections = await fetchPlexJson<PlexSectionResponse>(
    `${access.base}/library/sections?${plexTokenParam(access.cfg)}`,
    access.clientIdentifier
  );
  const dirs = sections.MediaContainer?.Directory ?? [];
  const libraries = dirs.map((d) => ({
    key: String(d.key),
    title: d.title ?? "Library",
    type: d.type ?? "unknown",
  }));
  return {
    ok: true,
    message: `Connected to Plex (${libraries.length} librar${libraries.length === 1 ? "y" : "ies"}).`,
    version: identity?.MediaContainer?.version,
    libraries,
  };
}

async function fetchPlexSectionItems(
  base: string,
  tokenParam: string,
  sectionKey: string,
  clientIdentifier: string,
  onPage?: (loaded: number, total: number) => Promise<void>
) {
  const pageSize = 200;
  const all: PlexItemMeta[] = [];
  let start = 0;
  for (;;) {
    const items = await fetchPlexJson<PlexItemsResponse>(
      `${base}/library/sections/${sectionKey}/all?${tokenParam}&includeMeta=1&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
      clientIdentifier
    );
    const metadata = items.MediaContainer?.Metadata ?? [];
    all.push(...metadata);
    const total = items.MediaContainer?.totalSize ?? items.MediaContainer?.size ?? metadata.length;
    start += metadata.length;
    await onPage?.(all.length, total);
    if (!metadata.length || start >= total) break;
    if (all.length >= 100_000) break;
  }
  return all;
}

type PluginStreamRow = {
  name: string;
  streamUrl: string;
  type: StreamType;
  serverId?: string | null;
  streamIcon?: string | null;
  categoryId?: string | null;
  seriesName?: string | null;
  seasonNum?: number | null;
  episodeNum?: number | null;
  sortOrder: number;
  agentStartCmd?: string | null;
};

async function createPluginStreamsBatch(rows: PluginStreamRow[]) {
  if (!rows.length) return 0;
  const movies = rows.filter((r) => r.type === StreamType.MOVIE);
  const series = rows.filter((r) => r.type === StreamType.SERIES);
  const other = rows.filter((r) => r.type !== StreamType.MOVIE && r.type !== StreamType.SERIES);
  let n = 0;
  if (movies.length) n += await createPluginStreamsBatchForBouquet(movies, "MOVIE");
  if (series.length) n += await createPluginStreamsBatchForBouquet(series, "SERIES");
  if (other.length) n += await createPluginStreamsBatchForBouquet(other, null);
  return n;
}

async function createPluginStreamsBatchForBouquet(
  rows: PluginStreamRow[],
  vodType: "MOVIE" | "SERIES" | null
) {
  if (!rows.length) return 0;
  try {
    const bouquetId = vodType ? await ensureVodBouquetId(vodType) : await ensurePluginImportBouquetId();
    await prisma.stream.createMany({
      data: rows.map((r) => ({
        name: r.name,
        streamUrl: r.streamUrl,
        type: r.type,
        sortOrder: r.sortOrder,
        hostedExternally: true,
        isActive: true,
        streamIcon: r.streamIcon ?? undefined,
        categoryId: r.categoryId ?? undefined,
        serverId: r.serverId ?? undefined,
        seriesName: r.seriesName ?? undefined,
        seasonNum: r.seasonNum ?? undefined,
        episodeNum: r.episodeNum ?? undefined,
        agentStartCmd: r.agentStartCmd ?? undefined,
      })),
    });
    const created = await prisma.stream.findMany({
      where: { streamUrl: { in: rows.map((r) => r.streamUrl) } },
      select: { id: true, streamUrl: true },
    });
    const sortByUrl = new Map(rows.map((r) => [r.streamUrl, r.sortOrder]));
    await prisma.bouquetStream.createMany({
      data: created.map((s) => ({
        bouquetId,
        streamId: s.id,
        sortOrder: sortByUrl.get(s.streamUrl) ?? 0,
      })),
      skipDuplicates: true,
    });
    if (vodType) {
      const pluginId = await findPluginImportBouquetId();
      if (pluginId) {
        await prisma.bouquetStream.deleteMany({
          where: { bouquetId: pluginId, streamId: { in: created.map((s) => s.id) } },
        });
      }
    }
    return rows.length;
  } catch (e) {
    console.error("[plex] batch insert failed, falling back", e instanceof Error ? e.message : e);
    for (const r of rows) {
      await upsertPluginStream(
        {
          name: r.name,
          streamUrl: r.streamUrl,
          type: r.type,
          serverId: r.serverId,
          streamIcon: r.streamIcon,
          categoryId: r.categoryId,
          seriesName: r.seriesName,
          seasonNum: r.seasonNum,
          episodeNum: r.episodeNum,
          agentStartCmd: r.agentStartCmd,
        },
        r.sortOrder
      );
    }
    return rows.length;
  }
}

async function upsertPluginStream(
  data: {
    name: string;
    streamUrl: string;
    type: StreamType;
    serverId?: string | null;
    streamIcon?: string | null;
    categoryId?: string | null;
    seriesName?: string | null;
    seasonNum?: number | null;
    episodeNum?: number | null;
    agentStartCmd?: string | null;
  },
  sortOrder: number
) {
  const existing = await prisma.stream.findFirst({
    where: { streamUrl: data.streamUrl, type: data.type },
  });
  if (existing) {
    await prisma.stream.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        sortOrder,
        isActive: true,
        hostedExternally: true,
        serverId: data.serverId ?? undefined,
        streamIcon: data.streamIcon ?? undefined,
        categoryId: data.categoryId ?? undefined,
        seriesName: data.seriesName ?? undefined,
        seasonNum: data.seasonNum ?? undefined,
        episodeNum: data.episodeNum ?? undefined,
        agentStartCmd: data.agentStartCmd ?? undefined,
      },
    });
    await linkStreamToVodBouquet(existing.id, data.type, sortOrder);
    return { created: false };
  }
  const stream = await prisma.stream.create({
    data: {
      ...data,
      sortOrder,
      hostedExternally: true,
      isActive: true,
    },
  });
  await linkStreamToVodBouquet(stream.id, data.type, sortOrder);
  return { created: true };
}

/** Point existing Plex rows at the panel artwork proxy (browser cannot reach the Plex host). */
async function backfillPlexArtworkIcons(
  integrationId: string,
  reporter?: IntegrationSyncReporter,
  origin?: string | null
) {
  const prefix = `nexlify://plex/${integrationId}/`;
  const rows = await prisma.stream.findMany({
    where: { streamUrl: { startsWith: prefix } },
    select: { id: true, streamUrl: true, streamIcon: true },
  });
  await reporter?.note(`Updating poster links for ${rows.length.toLocaleString()} existing Plex titles…`, {
    titleCurrent: 0,
    titleTotal: rows.length,
  });
  const ops = [];
  let n = 0;
  for (const row of rows) {
    n++;
    const parsed = parseIntegrationStreamUrl(row.streamUrl);
    if (!parsed || parsed.type !== "plex") continue;
    const next = plexArtworkUrl(parsed.integrationId, parsed.itemId, origin);
    if (row.streamIcon === next) continue;
    ops.push(prisma.stream.update({ where: { id: row.id }, data: { streamIcon: next } }));
    if (ops.length >= 20) {
      await Promise.all(ops);
      ops.length = 0;
      await reporter?.note(`Updating poster links… ${n.toLocaleString()}/${rows.length.toLocaleString()}`, {
        titleCurrent: n,
        titleTotal: rows.length,
      });
    }
  }
  if (ops.length) await Promise.all(ops);
}

/** Strip legacy "(Plex)" suffixes from stream titles — source is shown separately in the UI. */
async function backfillPlexDisplayNames(integrationId: string, reporter?: IntegrationSyncReporter) {
  const prefix = `nexlify://plex/${integrationId}/`;
  await reporter?.note(`Cleaning Plex title suffixes…`);
  const updated = await prisma.$executeRaw`
    UPDATE "Stream"
    SET name = trim(regexp_replace(name, '\s*\((Plex|Emby|Jellyfin|YouTube|Spotify|Deezer|Apple Music)\)\s*$', '', 'i'))
    WHERE "streamUrl" LIKE ${`${prefix}%`}
      AND name ~* '\((Plex|Emby|Jellyfin|YouTube|Spotify|Deezer|Apple Music)\)\s*$'
  `;
  const count = Number(updated);
  if (count > 0) {
    await reporter?.note(`Cleaned ${count.toLocaleString()} Plex title(s) (removed integration suffix).`);
  }
}

function genreFromAgentCmd(raw: string | null | undefined): string | null {
  const meta = parseVodAgentCmd(raw);
  const genre = String(meta.genre ?? meta.tmdbGenres ?? "").trim();
  if (!genre) return null;
  // Prefer first tag when comma-separated
  return genre.split(",")[0]?.trim() || null;
}

/** Put Plex rows into flat genre categories (Xtream-safe — not one category per show). */
async function backfillPlexCategories(integrationId: string, reporter?: IntegrationSyncReporter) {
  const prefix = `nexlify://plex/${integrationId}/`;
  const catCache = new Map<string, string>();
  const movieCat = async (genre?: string | null) => {
    const key = `m:${genre ?? ""}`;
    let id = catCache.get(key);
    if (!id) {
      id = await categoryForPlexMovie(genre);
      catCache.set(key, id);
    }
    return id;
  };
  const seriesCat = async (genre?: string | null) => {
    const key = `s:${genre ?? ""}`;
    let id = catCache.get(key);
    if (!id) {
      id = await categoryForPlexSeries(genre);
      catCache.set(key, id);
    }
    return id;
  };

  await reporter?.note("Assigning Plex movies to genre categories…");
  let movieCursor: string | undefined;
  let moviesDone = 0;
  for (;;) {
    const rows = await prisma.stream.findMany({
      where: { streamUrl: { startsWith: prefix }, type: StreamType.MOVIE },
      select: { id: true, agentStartCmd: true },
      take: 500,
      orderBy: { id: "asc" },
      ...(movieCursor ? { skip: 1, cursor: { id: movieCursor } } : {}),
    });
    if (!rows.length) break;
    const byCat = new Map<string, string[]>();
    for (const row of rows) {
      const categoryId = await movieCat(genreFromAgentCmd(row.agentStartCmd));
      const list = byCat.get(categoryId) ?? [];
      list.push(row.id);
      byCat.set(categoryId, list);
    }
    for (const [categoryId, ids] of byCat) {
      await prisma.stream.updateMany({ where: { id: { in: ids } }, data: { categoryId } });
    }
    moviesDone += rows.length;
    movieCursor = rows[rows.length - 1]!.id;
    if (moviesDone % 2000 === 0) {
      await reporter?.note(`Movie genres ${moviesDone.toLocaleString()}…`);
    }
    if (rows.length < 500) break;
  }

  await reporter?.note("Assigning Plex TV episodes to genre categories (not per-show folders)…");
  const showGenre = new Map<string, string | null>();
  let seriesCursor: string | undefined;
  let seriesDone = 0;
  for (;;) {
    const rows = await prisma.stream.findMany({
      where: { streamUrl: { startsWith: prefix }, type: StreamType.SERIES },
      select: { id: true, seriesName: true, agentStartCmd: true },
      take: 800,
      orderBy: { id: "asc" },
      ...(seriesCursor ? { skip: 1, cursor: { id: seriesCursor } } : {}),
    });
    if (!rows.length) break;
    const byCat = new Map<string, string[]>();
    for (const row of rows) {
      const showKey = (row.seriesName?.trim() || "").toLowerCase();
      if (showKey && !showGenre.has(showKey)) {
        showGenre.set(showKey, genreFromAgentCmd(row.agentStartCmd));
      }
      const genre = showKey ? showGenre.get(showKey) : genreFromAgentCmd(row.agentStartCmd);
      const categoryId = await seriesCat(genre);
      const list = byCat.get(categoryId) ?? [];
      list.push(row.id);
      byCat.set(categoryId, list);
    }
    for (const [categoryId, ids] of byCat) {
      for (let i = 0; i < ids.length; i += 200) {
        await prisma.stream.updateMany({
          where: { id: { in: ids.slice(i, i + 200) } },
          data: { categoryId },
        });
      }
    }
    seriesDone += rows.length;
    seriesCursor = rows[rows.length - 1]!.id;
    if (seriesDone % 5000 === 0 || rows.length < 800) {
      await reporter?.note(`TV Series genres ${seriesDone.toLocaleString()}…`);
    }
    if (rows.length < 800) break;
  }
}

export async function repairPlexVodPlacement(
  integrationId: string,
  reporter?: IntegrationSyncReporter
): Promise<{ movies: number; series: number }> {
  await reporter?.note("Attaching Movies and TV Series bouquets to all lines…");
  await attachVodBouquetsToAllLines();
  await backfillPlexDisplayNames(integrationId, reporter);
  await backfillPlexCategories(integrationId, reporter);
  await reporter?.note("Moving Plex titles into the Movies and TV Series bouquets…");
  const linked = await relinkPlexStreamsToVodBouquets(integrationId);
  await invalidateXtreamCategories();
  return linked;
}

export async function cleanAllPlexDisplayNames(reporter?: IntegrationSyncReporter) {
  const rows = await prisma.mediaIntegration.findMany({
    where: { type: "plex" },
    select: { id: true, name: true },
  });
  for (const row of rows) {
    await reporter?.note(`Cleaning Plex titles in “${row.name}”…`);
    await backfillPlexDisplayNames(row.id, reporter);
  }
}

export async function repairAllPlexVodPlacement(reporter?: IntegrationSyncReporter) {
  const rows = await prisma.mediaIntegration.findMany({
    where: { type: "plex" },
    select: { id: true, name: true },
  });
  const results: { name: string; movies: number; series: number }[] = [];
  for (const row of rows) {
    await reporter?.note(`Sorting Plex library “${row.name}”…`);
    results.push({ name: row.name, ...(await repairPlexVodPlacement(row.id, reporter)) });
  }
  return results;
}

/**
 * Pull Genre tags from Plex libraries and assign flat Xtream categories
 * (Action, Comedy, …) without re-importing every episode.
 */
export async function backfillPlexGenresFromLibrary(
  integrationId: string,
  reporter?: IntegrationSyncReporter
): Promise<{ moviesUpdated: number; seriesShowsUpdated: number; episodesUpdated: number }> {
  await reporter?.note("Connecting to Plex for genre tags…");
  const { cfg, base, clientIdentifier } = await ensurePlexAccess(integrationId);
  const tokenParam = plexTokenParam(cfg);
  const prefix = `nexlify://plex/${integrationId}/`;

  const sections = await fetchPlexJson<PlexSectionResponse>(
    `${base}/library/sections?${tokenParam}`,
    clientIdentifier
  );
  let dirs = sections.MediaContainer?.Directory ?? [];
  if (cfg.libraryKey) {
    dirs = dirs.filter((d) => String(d.key) === String(cfg.libraryKey));
  }
  dirs = dirs.filter((d) => !d.type || d.type === "movie" || d.type === "show");

  const catCache = new Map<string, string>();
  const movieCat = async (genre?: string | null) => {
    const key = `m:${genre ?? ""}`;
    let id = catCache.get(key);
    if (!id) {
      id = await categoryForPlexMovie(genre);
      catCache.set(key, id);
    }
    return id;
  };
  const seriesCat = async (genre?: string | null) => {
    const key = `s:${genre ?? ""}`;
    let id = catCache.get(key);
    if (!id) {
      id = await categoryForPlexSeries(genre);
      catCache.set(key, id);
    }
    return id;
  };

  let moviesUpdated = 0;
  let seriesShowsUpdated = 0;
  let episodesUpdated = 0;

  for (const section of dirs) {
    const libraryName = section.title ?? section.key;
    const isShow = section.type === "show";
    await reporter?.note(`Loading ${isShow ? "shows" : "movies"} from “${libraryName}”…`);
    const metadata = await fetchPlexSectionItems(
      base,
      tokenParam,
      section.key,
      clientIdentifier,
      async (loaded, total) => {
        if (loaded % 1000 === 0 || loaded === total) {
          await reporter?.note(
            `${libraryName}: ${loaded.toLocaleString()}/${total.toLocaleString()} titles…`
          );
        }
      }
    );

    if (!isShow) {
      const existing = await prisma.stream.findMany({
        where: { streamUrl: { startsWith: prefix }, type: StreamType.MOVIE },
        select: { id: true, streamUrl: true, agentStartCmd: true },
      });
      const byUrl = new Map(existing.map((r) => [r.streamUrl, r]));
      const pending: { id: string; categoryId: string; agentStartCmd: string }[] = [];
      const flush = async () => {
        if (!pending.length) return;
        const batch = pending.splice(0, pending.length);
        for (const row of batch) {
          await prisma.stream.update({
            where: { id: row.id },
            data: { categoryId: row.categoryId, agentStartCmd: row.agentStartCmd },
          });
        }
        moviesUpdated += batch.length;
      };

      for (const item of metadata) {
        const ratingKey = item.ratingKey ?? item.key?.replace("/library/metadata/", "");
        if (!ratingKey) continue;
        const genre = plexGenreName(item);
        if (!genre) continue;
        const streamUrl = buildIntegrationStreamUrl("plex", integrationId, String(ratingKey));
        const row = byUrl.get(streamUrl);
        if (!row) continue;
        const categoryId = await movieCat(genre);
        const meta = parseVodAgentCmd(row.agentStartCmd);
        const agentStartCmd = encodeVodAgentCmd({
          ...meta,
          genre,
          tmdbGenres: genre,
        });
        pending.push({ id: row.id, categoryId, agentStartCmd });
        if (pending.length >= 40) await flush();
      }
      await flush();
      await reporter?.note(`Movies updated from genres: ${moviesUpdated.toLocaleString()}`);
      continue;
    }

    // TV shows: one category update per show → all episodes
    for (let i = 0; i < metadata.length; i++) {
      const item = metadata[i]!;
      const name = item.title?.trim();
      if (!name) continue;
      const genre = plexGenreName(item);
      if (!genre) continue;
      const categoryId = await seriesCat(genre);
      const result = await prisma.stream.updateMany({
        where: {
          streamUrl: { startsWith: prefix },
          type: StreamType.SERIES,
          seriesName: { equals: name, mode: "insensitive" },
        },
        data: { categoryId },
      });
      if (result.count > 0) {
        seriesShowsUpdated++;
        episodesUpdated += result.count;
      }
      if ((i + 1) % 100 === 0 || i + 1 === metadata.length) {
        await reporter?.note(
          `${libraryName}: genres ${i + 1}/${metadata.length} shows · ${episodesUpdated.toLocaleString()} episodes`
        );
      }
    }
  }

  await invalidateXtreamCategories();
  await reporter?.note(
    `Done. Movies ${moviesUpdated.toLocaleString()}, shows ${seriesShowsUpdated.toLocaleString()}, episodes ${episodesUpdated.toLocaleString()}.`
  );
  return { moviesUpdated, seriesShowsUpdated, episodesUpdated };
}

export async function backfillAllPlexGenresFromLibrary(reporter?: IntegrationSyncReporter) {
  const rows = await prisma.mediaIntegration.findMany({
    where: { type: "plex" },
    select: { id: true, name: true },
  });
  const results: {
    name: string;
    moviesUpdated: number;
    seriesShowsUpdated: number;
    episodesUpdated: number;
  }[] = [];
  for (const row of rows) {
    await reporter?.note(`Genre sync for “${row.name}”…`);
    results.push({ name: row.name, ...(await backfillPlexGenresFromLibrary(row.id, reporter)) });
  }
  return results;
}

async function importPlexEpisodesForShow(
  base: string,
  tokenParam: string,
  showRatingKey: string,
  showTitle: string,
  integrationId: string,
  serverId: string | null | undefined,
  sortCounter: { value: number },
  clientIdentifier: string,
  plexUrls?: Set<string>,
  showPoster?: string | null,
  reporter?: IntegrationSyncReporter,
  artworkOrigin?: string | null,
  categoryId?: string | null,
  showItem?: PlexItemMeta
) {
  let imported = 0;
  let skipped = 0;
  await reporter?.note(`Fetching episodes for ${showTitle}…`);

  let episodes: PlexItemMeta[] = [];
  try {
    const leaves = await fetchPlexJson<PlexItemsResponse>(
      `${base}/library/metadata/${showRatingKey}/allLeaves?${tokenParam}&includeMeta=1`,
      clientIdentifier
    );
    episodes = leaves.MediaContainer?.Metadata ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Plex episode fetch failed";
    await reporter?.note(`Could not load episodes for ${showTitle}: ${msg}`);
    return { imported: 0, skipped: 0, warning: `${showTitle}: ${msg}` };
  }

  const pending: PluginStreamRow[] = [];
  const flushAt = 40;
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    await createPluginStreamsBatch(batch);
    imported += batch.length;
  };

  let n = 0;
  for (const ep of episodes) {
    n++;
    if (ep.type && ep.type !== "episode") continue;
    const ratingKey = ep.ratingKey ?? ep.key?.replace("/library/metadata/", "");
    if (!ratingKey) continue;

    const seasonNum = ep.parentIndex ?? 1;
    const episodeNum = ep.index ?? 1;
    const epTitle = ep.title?.trim() ?? `Episode ${episodeNum}`;
    const name = `${showTitle} — S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")} — ${epTitle}`;
    const streamUrl = buildIntegrationStreamUrl("plex", integrationId, String(ratingKey));
    if (plexUrls?.has(streamUrl)) {
      skipped++;
    } else {
      const showMeta = plexVodMetaFromItem(showItem ?? {});
      const epMeta = plexVodMetaFromItem(ep);
      pending.push({
        name,
        streamUrl,
        type: StreamType.SERIES,
        serverId,
        streamIcon: showPoster || plexArtworkUrl(integrationId, String(ratingKey), artworkOrigin),
        categoryId,
        seriesName: showTitle,
        seasonNum,
        episodeNum,
        sortOrder: sortCounter.value++,
        agentStartCmd: encodeVodAgentCmd({
          ...showMeta,
          ...epMeta,
          plot: String(epMeta.plot || showMeta.plot || ""),
          cast: String(epMeta.cast || showMeta.cast || ""),
          director: String(epMeta.director || showMeta.director || ""),
          genre: String(epMeta.genre || showMeta.genre || ""),
        }),
      });
      plexUrls?.add(streamUrl);
      if (pending.length >= flushAt) await flush();
    }
    if (n % 15 === 0 || n === episodes.length) {
      await reporter?.note(
        `${showTitle}: episode ${n.toLocaleString()}/${episodes.length.toLocaleString()} · ${imported} new this show`,
        { titleCurrent: n, titleTotal: episodes.length, libraryName: showTitle }
      );
    }
  }
  await flush();
  return { imported, skipped };
}

export async function listPlexLibraries(integrationId: string) {
  const access = await ensurePlexAccess(integrationId);
  const sections = await fetchPlexJson<PlexSectionResponse>(
    `${access.base}/library/sections?${plexTokenParam(access.cfg)}`,
    access.clientIdentifier
  );
  const dirs = sections.MediaContainer?.Directory ?? [];
  return dirs.map((d) => ({
    key: String(d.key),
    title: d.title ?? "Library",
    type: d.type ?? "unknown",
  }));
}

export async function importPlexLibrary(
  integrationId: string,
  serverId?: string | null,
  reporter?: IntegrationSyncReporter
) {
  await reporter?.step("connect", "Connecting to Plex…");
  const access = await ensurePlexAccess(integrationId);
  const { cfg, base, clientIdentifier } = access;
  const tokenParam = plexTokenParam(cfg);
  const effectiveServerId = serverId ?? cfg.serverId ?? null;

  await reporter?.step("libraries", "Loading Plex libraries…");
  const sections = await fetchPlexJson<PlexSectionResponse>(
    `${base}/library/sections?${tokenParam}`,
    clientIdentifier
  );
  let dirs = sections.MediaContainer?.Directory ?? [];
  if (cfg.libraryKey) {
    dirs = dirs.filter((d) => String(d.key) === String(cfg.libraryKey));
  }
  dirs = dirs.filter((d) => !d.type || d.type === "movie" || d.type === "show");
  if (!dirs.length) {
    throw new Error("No movie or TV libraries found on this Plex server.");
  }

  let imported = 0;
  let skipped = 0;
  let episodes = 0;
  const sortCounter = { value: (await maxStreamSortOrder()) + 1 };
  const warnings: string[] = [];
  const libraryCap = 20;
  const selected = dirs.slice(0, libraryCap);
  if (dirs.length > libraryCap) {
    warnings.push(`Only the first ${libraryCap} Plex libraries were synced.`);
  }

  await reporter?.step("index", "Checking titles already on this panel…");
  const catalog = await loadPlexCatalogIndex(integrationId);
  let artworkOrigin = "";
  try {
    artworkOrigin = (await resolveServerUrls()).serverUrl.replace(/\/$/, "");
  } catch {
    artworkOrigin = String(process.env.NEXT_PUBLIC_SERVER_URL ?? "").replace(/\/$/, "");
  }
  const posterFor = (itemId: string) => plexArtworkUrl(integrationId, itemId, artworkOrigin);
  const categoryCache = new Map<string, string>();
  const movieCategory = async (genre?: string | null) => {
    const key = `m:${genre ?? ""}`;
    let id = categoryCache.get(key);
    if (!id) {
      id = await categoryForPlexMovie(genre);
      categoryCache.set(key, id);
    }
    return id;
  };
  const seriesCategory = async (_show: string, genre?: string | null) => {
    const key = `s:${genre ?? ""}`;
    let id = categoryCache.get(key);
    if (!id) {
      id = await categoryForPlexSeries(genre);
      categoryCache.set(key, id);
    }
    return id;
  };
  await reporter?.step("artwork", "Updating poster URLs for titles already synced…");
  await backfillPlexArtworkIcons(integrationId, reporter, artworkOrigin);
  await reporter?.step("categories", "Putting Plex titles into Movies and TV Series…");
  await repairPlexVodPlacement(integrationId, reporter);
  const skipCatalog = cfg.skipExistingCatalog !== false;
  let skippedCatalog = 0;
  const plexPrefix = `nexlify://plex/${integrationId}/`;

  const pendingIcons: {
    id: string;
    streamIcon?: string;
    categoryId?: string | null;
    agentStartCmd?: string | null;
  }[] = [];
  const flushIcons = async () => {
    if (!pendingIcons.length) return;
    const batch = pendingIcons.splice(0, pendingIcons.length);
    await Promise.all(
      batch.map((row) =>
        prisma.stream.update({
          where: { id: row.id },
          data: {
            ...(row.streamIcon ? { streamIcon: row.streamIcon } : {}),
            ...(row.categoryId ? { categoryId: row.categoryId } : {}),
            ...(row.agentStartCmd ? { agentStartCmd: row.agentStartCmd } : {}),
          },
        })
      )
    );
  };

  await reporter?.counts({ total: selected.length, current: 0 });
  await reporter?.step(
    "import",
    `Found ${selected.length} librar${selected.length === 1 ? "y" : "ies"} · ${catalog.movieKeys.size + catalog.seriesKeys.size} panel titles to skip`
  );

  const pendingMovies: PluginStreamRow[] = [];
  const flushMovies = async () => {
    if (!pendingMovies.length) return;
    const batch = pendingMovies.splice(0, pendingMovies.length);
    try {
      await createPluginStreamsBatch(batch);
      imported += batch.length;
    } catch (e) {
      warnings.push(`Movie batch failed: ${e instanceof Error ? e.message : "insert error"}`);
    }
  };

  for (let i = 0; i < selected.length; i++) {
    const section = selected[i];
    const libraryName = section.title ?? section.key;
    await reporter?.step("import", `Library ${i + 1}/${selected.length}: ${libraryName}…`);
    await reporter?.counts({ current: i + 1, total: selected.length, libraryName });
    const metadata = await fetchPlexSectionItems(
      base,
      tokenParam,
      section.key,
      clientIdentifier,
      async (loaded, total) => {
        await reporter?.note(
          `Loading ${libraryName} from Plex: ${loaded.toLocaleString()}/${total.toLocaleString()} titles…`,
          {
            current: i + 1,
            total: selected.length,
            titleCurrent: loaded,
            titleTotal: total,
            libraryName,
            imported,
            skipped,
            episodes,
          }
        );
      }
    );
    await reporter?.step(
      "import",
      `${libraryName}: ${metadata.length.toLocaleString()} title${metadata.length === 1 ? "" : "s"}`
    );

    let n = 0;
    for (const item of metadata) {
      n++;
      const name = item.title?.trim();
      const ratingKey = item.ratingKey ?? item.key?.replace("/library/metadata/", "");
      if (n % 10 === 0 || n === metadata.length) {
        await reporter?.note(
          `${libraryName}: ${n.toLocaleString()}/${metadata.length.toLocaleString()}${name ? ` · ${name}` : ""} · ${imported.toLocaleString()} new · ${skipped.toLocaleString()} skipped`,
          {
            current: i + 1,
            total: selected.length,
            titleCurrent: n,
            titleTotal: metadata.length,
            libraryName,
            imported,
            skipped,
            episodes,
          }
        );
      }
      if (!name || !ratingKey) continue;

      const isShow = item.type === "show" || section.type === "show";
      const titleKey = plexCatalogTitleKey(name);
      const streamUrl = buildIntegrationStreamUrl("plex", integrationId, String(ratingKey));
      const existingPlex = catalog.plexByUrl.get(streamUrl);

      if (existingPlex) {
        skipped++;
        if (existingPlex.type === StreamType.MOVIE) {
          pendingIcons.push({
            id: existingPlex.id,
            streamIcon: posterFor(String(ratingKey)),
            categoryId: await movieCategory(plexGenreName(item)),
            agentStartCmd: encodeVodAgentCmd(plexVodMetaFromItem(item)),
          });
          if (pendingIcons.length >= 20) await flushIcons();
        }
        continue;
      }

      if (isShow) {
        const showCategoryId = await seriesCategory(name, plexGenreName(item));
        const showCmd = encodeVodAgentCmd(plexVodMetaFromItem(item));
        await prisma.stream.updateMany({
          where: {
            type: StreamType.SERIES,
            streamUrl: { startsWith: plexPrefix },
            seriesName: { equals: name, mode: "insensitive" },
          },
          data: { categoryId: showCategoryId },
        });
        await prisma.stream.updateMany({
          where: {
            type: StreamType.SERIES,
            streamUrl: { startsWith: plexPrefix },
            seriesName: { equals: name, mode: "insensitive" },
            OR: [{ agentStartCmd: null }, { agentStartCmd: "" }],
          },
          data: { agentStartCmd: showCmd },
        });

        if (skipCatalog && titleKey && catalog.seriesKeys.has(titleKey)) {
          skipped++;
          skippedCatalog++;
          const existingId = catalog.seriesIdByKey.get(titleKey);
          if (existingId) {
            pendingIcons.push({ id: existingId, streamIcon: posterFor(String(ratingKey)) });
            catalog.seriesIdByKey.delete(titleKey);
            if (pendingIcons.length >= 20) await flushIcons();
          }
          continue;
        }

        await flushMovies();
        const showPoster = posterFor(String(ratingKey));
        try {
          const epResult = await importPlexEpisodesForShow(
            base,
            tokenParam,
            String(ratingKey),
            name,
            integrationId,
            effectiveServerId,
            sortCounter,
            clientIdentifier,
            catalog.plexUrls,
            showPoster,
            reporter,
            artworkOrigin,
            showCategoryId,
            item
          );
          imported += epResult.imported;
          skipped += epResult.skipped;
          episodes += epResult.imported;
          if (epResult.warning) warnings.push(epResult.warning);
        } catch (e) {
          warnings.push(`${name}: ${e instanceof Error ? e.message : "episode import failed"}`);
        }
        if (titleKey) catalog.seriesKeys.add(titleKey);
        continue;
      }

      if (skipCatalog && titleKey && catalog.movieKeys.has(titleKey)) {
        skipped++;
        skippedCatalog++;
        const existingId = catalog.movieIdByKey.get(titleKey);
        if (existingId) {
          pendingIcons.push({ id: existingId, streamIcon: posterFor(String(ratingKey)) });
          catalog.movieIdByKey.delete(titleKey);
          if (pendingIcons.length >= 20) await flushIcons();
        }
        continue;
      }

      pendingMovies.push({
        name,
        streamUrl,
        type: StreamType.MOVIE,
        serverId: effectiveServerId,
        streamIcon: plexArtworkUrl(integrationId, String(ratingKey), artworkOrigin),
        categoryId: await movieCategory(plexGenreName(item)),
        sortOrder: sortCounter.value++,
        agentStartCmd: encodeVodAgentCmd(plexVodMetaFromItem(item)),
      });
      catalog.plexUrls.add(streamUrl);
      if (titleKey) catalog.movieKeys.add(titleKey);
      if (pendingMovies.length >= 40) await flushMovies();
    }
    await flushMovies();
  }
  await flushIcons();

  await reporter?.step("bouquets", "Making synced titles available on all lines…");
  await attachVodBouquetsToAllLines();
  await relinkPlexStreamsToVodBouquets(integrationId);
  await invalidateXtreamCategories();
  await reporter?.step("finish", "Saving last sync time…");

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });
  const lastRunIso = new Date().toISOString();
  await prisma.panelSetting.upsert({
    where: { key: "plex_auto_sync_last_run" },
    create: { key: "plex_auto_sync_last_run", value: lastRunIso },
    update: { value: lastRunIso },
  });

  const result = {
    imported,
    skipped,
    skippedCatalog,
    episodes,
    warnings: warnings.length ? warnings : undefined,
    bouquet: "Plugin imports",
  };
  await reporter?.counts({ imported, skipped, episodes, current: selected.length, total: selected.length, warnings });
  await reporter?.done(
    `Sync complete: ${imported} new · ${skipped} skipped (${skippedCatalog} already on the panel)` +
      (episodes ? ` · ${episodes} episodes` : ""),
    result
  );
  return result;
}

function extractYoutubeChannelId(url: string): string | null {
  const u = url.trim();
  const channelMatch = u.match(/youtube\.com\/channel\/([^/?]+)/i);
  if (channelMatch) return channelMatch[1];
  if (/^UC[\w-]{20,}$/i.test(u)) return u;
  return null;
}

async function resolveYoutubeChannelId(url: string): Promise<string | null> {
  const direct = extractYoutubeChannelId(url);
  if (direct) return direct;
  const handle = url.trim().match(/youtube\.com\/@([^/?]+)/i);
  if (!handle) return null;
  try {
    const res = await fetch(`https://www.youtube.com/@${handle[1]}`, {
      headers: { "Accept-Language": "en", "User-Agent": "Mozilla/5.0 NexlifyPanel" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/"channelId":"(UC[\w-]{20,})"/) ||
      html.match(/\/channel\/(UC[\w-]{20,})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function testYoutubeConnection(integrationId: string) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "youtube") throw new Error("YouTube integration not found");
  const cfg = row.config as Record<string, unknown>;
  const channelUrl = String(cfg.channelUrl ?? cfg.url ?? "").trim();
  if (!channelUrl) throw new Error("YouTube channel URL required");
  const channelId = await resolveYoutubeChannelId(channelUrl);
  if (!channelId) {
    throw new Error("Could not resolve that YouTube channel. Use a /channel/UC… URL or @handle.");
  }
  const ids = await fetchYoutubeVideoIdsFromRss(channelId);
  return {
    ok: true,
    message: `YouTube channel ${channelId} — ${ids.length} recent video${ids.length === 1 ? "" : "s"} in RSS.`,
    channelId,
    videos: ids.length,
  };
}

async function fetchYoutubeVideoIdsFromRss(channelId: string): Promise<string[]> {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    { signal: AbortSignal.timeout(20_000) }
  );
  if (!res.ok) return [];
  const xml = await res.text();
  const ids: string[] = [];
  const re = /<yt:videoId>([^<]+)<\/yt:videoId>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && ids.length < 40) {
    ids.push(m[1]);
  }
  return ids;
}

export async function importYoutubeSource(
  integrationId: string,
  serverId?: string | null,
  reporter?: IntegrationSyncReporter
) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "youtube") throw new Error("YouTube integration not found");
  const cfg = row.config as Record<string, unknown>;
  const channelUrl = String(cfg.channelUrl ?? cfg.url ?? "").trim();
  if (!channelUrl) throw new Error("YouTube channel URL required");
  const effectiveServerId = serverId ?? (cfg.serverId ? String(cfg.serverId) : null);

  await reporter?.step("connect", "Resolving YouTube channel…");
  const channelId = await resolveYoutubeChannelId(channelUrl);
  let imported = 0;
  const sortCounter = { value: (await maxStreamSortOrder()) + 1 };

  if (channelId) {
    await reporter?.step("import", `Fetching RSS for ${channelId}…`);
    const videoIds = await fetchYoutubeVideoIdsFromRss(channelId);
    await reporter?.counts({ total: videoIds.length });
    for (const videoId of videoIds) {
      const streamUrl = buildIntegrationStreamUrl("youtube", integrationId, videoId);
      const r = await upsertPluginStream(
        {
          name: `${row.name} — ${videoId}`,
          streamUrl,
          type: StreamType.LIVE,
          serverId: effectiveServerId,
        },
        sortCounter.value++
      );
      if (r.created) imported++;
    }
  }

  if (imported === 0) {
    await reporter?.step("import", "No RSS videos found — adding a channel placeholder.");
    const streamUrl = buildIntegrationStreamUrl("youtube", integrationId, "channel");
    const r = await upsertPluginStream(
      {
        name: `${row.name} (YouTube)`,
        streamUrl,
        type: StreamType.LIVE,
        serverId: effectiveServerId,
      },
      sortCounter.value++
    );
    if (r.created) imported = 1;
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });
  const result = { imported, bouquet: "Plugin imports" };
  await reporter?.done(`Synced ${imported} YouTube stream(s).`, result);
  return result;
}

/** Resolve a playable Plex URL for integration streams (movies + episodes). */
export async function resolvePlexIntegrationPlayback(
  integrationId: string,
  itemId: string,
  cfgRaw: Record<string, unknown>
): Promise<string | null> {
  const cfg = normalizePlexConfig(cfgRaw);
  const base = buildPlexBaseUrl(cfg);
  const token = extractPlexToken(String(cfg.token ?? ""));
  if (!base || !token) return null;
  const profile = resolvePlexProfile(
    cfg.directStream ? "direct" : (cfg.transcodeProfile ?? "1080p")
  );
  const tokenParam = plexTokenParam(cfg);
  const clientIdentifier = plexClientIdentifier(cfg);

  let upstream: string | null = null;
  try {
    const meta = await fetchPlexJson<{
      MediaContainer?: { Metadata?: PlexJsonMetadata[] };
    }>(`${base}/library/metadata/${itemId}?${tokenParam}`, clientIdentifier);
    const item = meta.MediaContainer?.Metadata?.[0];
    if (item) {
      upstream = pickPlexPlaybackUrl(base, token, item, profile);
    }
  } catch {
    /* fall through to transcode URL */
  }

  if (!upstream) {
    const { buildPlexTranscodeM3u8 } = await import("@/lib/plex-playback");
    upstream = buildPlexTranscodeM3u8(base, token, itemId, profile);
  }

  // Remote LB server: playback egress uses the stream's assigned server proxy (see line-playback).
  // Imported Plex rows get serverId from integration config during sync.
  if (cfg.serverId && upstream) {
    const { prisma } = await import("@/lib/prisma");
    const server = await prisma.streamServer.findUnique({
      where: { id: String(cfg.serverId) },
      select: { id: true, isActive: true },
    });
    if (!server?.isActive) return upstream;
  }

  return upstream;
}
