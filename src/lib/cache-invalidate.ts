import { cacheDel, cacheDelExact } from "@/lib/cache";

export async function invalidateDashboardStats() {
  await cacheDelExact("stats:dashboard");
}

export async function invalidateXtreamCategories() {
  const { purgeCatalogDiskCache } = await import("@/lib/catalog-disk-cache");
  await Promise.all([
    cacheDel("xtream:live_categories"),
    cacheDel("xtream:vod_categories"),
    cacheDel("xtream:series_categories"),
    cacheDel("xtream:catnum:"),
    cacheDel("xtream:catcanon:"),
    cacheDel("xtream:catresolve:"),
    cacheDel("xtream:live_streams:"),
    cacheDel("xtream:vod_streams:"),
    cacheDel("xtream:series:"),
    purgeCatalogDiskCache(),
  ]);
}

export async function invalidateLineAuth(username: string) {
  await cacheDel(`line:cred:${username}:`);
}

export async function invalidateEpgCache() {
  const { purgeCatalogDiskCache } = await import("@/lib/catalog-disk-cache");
  await Promise.all([
    cacheDel("epg:"),
    cacheDel("xmltv:"),
    purgeCatalogDiskCache((name) => name.endsWith(".xml.gz") || name.endsWith(".lock")),
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
