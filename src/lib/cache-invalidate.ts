import { cacheDel, cacheDelExact } from "@/lib/cache";

export async function invalidateDashboardStats() {
  await cacheDelExact("stats:dashboard");
}

export async function invalidateXtreamCategories() {
  await Promise.all([
    cacheDel("xtream:live_categories"),
    cacheDel("xtream:vod_categories"),
    cacheDel("xtream:series_categories"),
    cacheDel("xtream:catnum:"),
    cacheDel("xtream:catcanon:"),
    cacheDel("xtream:catresolve:"),
  ]);
}

export async function invalidateLineAuth(username: string) {
  await cacheDel(`line:cred:${username}:`);
}

export async function invalidateEpgCache() {
  await Promise.all([cacheDel("epg:"), cacheDel("xmltv:")]);
}

export async function invalidatePlaybackUrls(streamId?: string) {
  if (streamId) {
    await cacheDel(`playback:url:*:${streamId}`);
    return;
  }
  await cacheDel("playback:url:");
}

export async function invalidateAllCache() {
  return cacheDel("*");
}
