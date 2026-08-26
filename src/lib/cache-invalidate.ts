import { cacheDel, cacheDelExact } from "@/lib/cache";

export async function invalidateDashboardStats() {
  await cacheDelExact("stats:dashboard");
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
    await cacheDel(`playback:url:*:${streamId}`);
    return;
  }
  await cacheDel("playback:url:");
}

export async function invalidateAllCache() {
  const { purgeCatalogDiskCache } = await import("@/lib/catalog-disk-cache");
  const [deleted] = await Promise.all([cacheDel("*"), purgeCatalogDiskCache()]);
  return deleted;
}
