import { cacheDel, cacheDelExact } from "@/lib/cache";

export async function invalidateDashboardStats() {
  await Promise.all([
    cacheDelExact("stats:dashboard"),
    cacheDelExact("stats:kpi"),
    cacheDelExact("stats:summary"),
    cacheDelExact("stats:server-metrics"),
    cacheDelExact("stream-errors:list"),
    cacheDelExact("dashboard:admin-widgets"),
  ]);
}

type XtreamDiskScope = "all" | "vod";

let catalogRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let catalogRefreshScope: XtreamDiskScope = "all";
let catalogRefreshRunning = false;

function xtreamBlobFilter(scope: XtreamDiskScope) {
  return (name: string) => {
    if (scope === "vod") {
      return name.startsWith("xtream-vod-") || name.startsWith("xtream-series-");
    }
    return name.startsWith("xtream-");
  };
}

async function purgeXtreamDiskCatalogs(scope: XtreamDiskScope) {
  const { purgeCatalogDiskCache } = await import("@/lib/catalog-disk-cache");
  await purgeCatalogDiskCache(xtreamBlobFilter(scope));
}

async function rebuildXtreamDiskCatalogs() {
  const { prisma } = await import("@/lib/prisma");
  const { lineAuthInclude } = await import("@/lib/lines");
  const { warmXtreamCatalogsNow } = await import("@/lib/xtream-catalog-blob");
  const { LineStatus } = await import("@prisma/client");
  const line = await prisma.line.findFirst({
    where: { status: LineStatus.ACTIVE, bouquets: { some: {} } },
    include: lineAuthInclude,
    orderBy: { createdAt: "asc" },
  });
  if (!line) return;
  await warmXtreamCatalogsNow(line);
}

function scheduleXtreamCatalogRebuild(scope: XtreamDiskScope) {
  if (scope === "all") catalogRefreshScope = "all";
  else if (catalogRefreshScope !== "all") catalogRefreshScope = "vod";
  if (catalogRefreshTimer) clearTimeout(catalogRefreshTimer);
  catalogRefreshTimer = setTimeout(() => {
    catalogRefreshTimer = null;
    const runScope = catalogRefreshScope;
    catalogRefreshScope = "vod";
    if (catalogRefreshRunning) {
      scheduleXtreamCatalogRebuild(runScope);
      return;
    }
    catalogRefreshRunning = true;
    void rebuildXtreamDiskCatalogs()
      .catch((err) => {
        console.error(
          "[xtream-catalog] rebuild after invalidate failed:",
          err instanceof Error ? err.message : err
        );
      })
      .finally(() => {
        catalogRefreshRunning = false;
      });
  }, 4000);
}

async function bustXtreamAppCatalog(scope: XtreamDiskScope) {
  await Promise.all([
    cacheDel("xtream:vod_info:"),
    cacheDel("xtream:series_info:"),
    purgeXtreamDiskCatalogs(scope),
  ]);
  scheduleXtreamCatalogRebuild(scope);
}

export async function invalidateXtreamCategories() {
  await Promise.all([
    cacheDel("xtream:live_categories"),
    cacheDel("xtream:vod_categories"),
    cacheDel("xtream:series_categories"),
    cacheDel("xtream:linecats:"),
    cacheDel("xtream:catnum:"),
    cacheDel("xtream:catcanon:"),
    cacheDel("xtream:catresolve:"),
    cacheDel("xtream:live_streams:"),
    cacheDel("xtream:vod_streams:"),
    cacheDel("xtream:series:"),
  ]);
  await bustXtreamAppCatalog("all");
}

/** Plex/VOD repair — do not drop live category cache (Smarters hits that on every open). */
export async function invalidateXtreamVodAndSeriesCatalogs() {
  await Promise.all([
    cacheDel("xtream:vod_categories"),
    cacheDel("xtream:series_categories"),
    cacheDel("xtream:linecats:"),
    cacheDel("xtream:vod_streams:"),
    cacheDel("xtream:series:"),
    cacheDel("xtream:catcanon:MOVIE"),
    cacheDel("xtream:catcanon:SERIES"),
  ]);
  await bustXtreamAppCatalog("vod");
}

export async function invalidateLineAuth(username: string) {
  await cacheDel(`line:cred:${username}:`);
}

export async function invalidateEpgCache() {
  const { purgeCatalogDiskCache } = await import("@/lib/catalog-disk-cache");
  await Promise.all([
    cacheDel("epg:"),
    cacheDel("xmltv:"),
    purgeCatalogDiskCache((name) => name.startsWith("xmltv-") && name.endsWith(".lock")),
  ]);
}

export async function invalidatePlaybackUrls(streamId?: string) {
  if (streamId) {
    await Promise.all([
      cacheDel(`playback:url:*:${streamId}`),
      cacheDel(`playback:urls:*:${streamId}`),
    ]);
    return;
  }
  await Promise.all([cacheDel("playback:url:"), cacheDel("playback:urls:")]);
}

/** Drop panel live-auth cache entries that pin a stream's upstream URL. */
export async function invalidateLiveAuthForStream(streamId: string) {
  const id = streamId?.trim();
  if (!id) return 0;
  // Keys: live-auth:v3:{lineId}:{streamId}:{ip}:{mode}:{serverId}
  return cacheDel(`live-auth:v3:*:${id}:*`);
}

/**
 * After source URL change or Restart on LIVE relay: clear panel caches and ask
 * the edge to drop the active fan so viewers re-auth against the new upstream.
 */
export async function refreshStreamPlayback(streamId: string): Promise<{
  liveAuthDeleted: number;
  edgeDropped: boolean;
}> {
  const id = streamId?.trim();
  if (!id) return { liveAuthDeleted: 0, edgeDropped: false };
  const [liveAuthDeleted] = await Promise.all([
    invalidateLiveAuthForStream(id),
    invalidatePlaybackUrls(id),
  ]);
  const edgeDropped = await requestEdgeDropStream(id).catch(() => false);
  return { liveAuthDeleted, edgeDropped };
}

async function requestEdgeDropStream(streamId: string): Promise<boolean> {
  const secret = String(
    process.env.INTERNAL_API_SECRET || process.env.PANEL_INTERNAL_SECRET || ""
  ).trim();
  if (!secret) return false;

  const hosts = new Set<string>();
  const envHost = String(process.env.NEXLIFY_EDGE_PREWARM_HOST || "").trim();
  if (envHost) hosts.add(envHost.replace(/^https?:\/\//, "").replace(/\/+$/, "").split(":")[0]);
  hosts.add("209.237.141.15");
  try {
    const { prisma } = await import("@/lib/prisma");
    const servers = await prisma.streamServer.findMany({
      where: { isActive: true },
      select: { host: true, name: true },
      take: 20,
    });
    for (const s of servers) {
      const h = String(s.host || "").trim();
      if (h && (s.name?.toLowerCase().includes("10gbs") || h === "209.237.141.15")) {
        hosts.add(h.replace(/^https?:\/\//, "").split(":")[0]);
      }
    }
  } catch {
    /* best-effort */
  }

  let ok = false;
  for (const host of hosts) {
    const url = `http://${host}:8080/edge/drop-stream?streamId=${encodeURIComponent(streamId)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-panel-internal-secret": secret },
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);
    if (res?.ok || res?.status === 202) ok = true;
  }
  return ok;
}

export async function invalidateAllCache() {
  const { purgeCatalogDiskCache } = await import("@/lib/catalog-disk-cache");
  const [deleted] = await Promise.all([cacheDel("*"), purgeCatalogDiskCache()]);
  return deleted;
}
