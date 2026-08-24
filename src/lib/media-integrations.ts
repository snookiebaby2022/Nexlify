import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma, StreamType } from "@prisma/client";
import {
  fetchPlexJson,
  pickPlexPlaybackUrl,
  resolvePlexProfile,
  type PlexJsonMetadata,
} from "@/lib/plex-playback";
import { buildIntegrationStreamUrl, parseIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { plexArtworkPath } from "@/lib/plex-artwork";
import { linkStreamToPluginBouquet, ensurePluginImportBouquetId, attachPluginBouquetToAllLines } from "@/lib/integration-bouquet";
import { maxStreamSortOrder } from "@/lib/stream-order";
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
import { loadPlexCatalogIndex, plexCatalogTitleKey } from "@/lib/plex-catalog-match";

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
  seriesName?: string | null;
  seasonNum?: number | null;
  episodeNum?: number | null;
  sortOrder: number;
};

async function createPluginStreamsBatch(rows: PluginStreamRow[]) {
  if (!rows.length) return 0;
  try {
    const bouquetId = await ensurePluginImportBouquetId();
    await prisma.stream.createMany({
      data: rows.map((r) => ({
        name: r.name,
        streamUrl: r.streamUrl,
        type: r.type,
        sortOrder: r.sortOrder,
        hostedExternally: true,
        isActive: true,
        streamIcon: r.streamIcon ?? undefined,
        serverId: r.serverId ?? undefined,
        seriesName: r.seriesName ?? undefined,
        seasonNum: r.seasonNum ?? undefined,
        episodeNum: r.episodeNum ?? undefined,
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
          seriesName: r.seriesName,
          seasonNum: r.seasonNum,
          episodeNum: r.episodeNum,
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
    seriesName?: string | null;
    seasonNum?: number | null;
    episodeNum?: number | null;
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
        seriesName: data.seriesName ?? undefined,
        seasonNum: data.seasonNum ?? undefined,
        episodeNum: data.episodeNum ?? undefined,
      },
    });
    await linkStreamToPluginBouquet(existing.id, sortOrder);
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
  await linkStreamToPluginBouquet(stream.id, sortOrder);
  return { created: true };
}

/** Point existing Plex rows at the panel artwork proxy (browser cannot reach the Plex host). */
async function backfillPlexArtworkIcons(integrationId: string, reporter?: IntegrationSyncReporter) {
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
    const next = plexArtworkPath(parsed.integrationId, parsed.itemId);
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
  reporter?: IntegrationSyncReporter
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
    const name = `${showTitle} — S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")} — ${epTitle} (Plex)`;
    const streamUrl = buildIntegrationStreamUrl("plex", integrationId, String(ratingKey));
    if (plexUrls?.has(streamUrl)) {
      skipped++;
    } else {
      pending.push({
        name,
        streamUrl,
        type: StreamType.SERIES,
        serverId,
        streamIcon: showPoster || plexArtworkPath(integrationId, String(ratingKey)),
        seriesName: showTitle,
        seasonNum,
        episodeNum,
        sortOrder: sortCounter.value++,
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
  await reporter?.step("artwork", "Updating poster URLs for titles already synced…");
  await backfillPlexArtworkIcons(integrationId, reporter);
  const skipCatalog = cfg.skipExistingCatalog !== false;
  let skippedCatalog = 0;

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

      if (catalog.plexUrls.has(streamUrl)) {
        skipped++;
        continue;
      }

      if (skipCatalog && titleKey) {
        const alreadyOnPanel = isShow ? catalog.seriesKeys.has(titleKey) : catalog.movieKeys.has(titleKey);
        if (alreadyOnPanel) {
          skipped++;
          skippedCatalog++;
          continue;
        }
      }

      if (isShow) {
        await flushMovies();
        const showPoster = plexArtworkPath(integrationId, String(ratingKey));
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
            reporter
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

      pendingMovies.push({
        name: `${name} (Plex)`,
        streamUrl,
        type: StreamType.MOVIE,
        serverId: effectiveServerId,
        streamIcon: plexArtworkPath(integrationId, String(ratingKey)),
        sortOrder: sortCounter.value++,
      });
      catalog.plexUrls.add(streamUrl);
      if (titleKey) catalog.movieKeys.add(titleKey);
      if (pendingMovies.length >= 40) await flushMovies();
    }
    await flushMovies();
  }

  await reporter?.step("bouquets", "Making synced titles available on all lines…");
  await attachPluginBouquetToAllLines();
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
