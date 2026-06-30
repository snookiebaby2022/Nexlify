import { cacheDel, cacheDelExact } from "@/lib/cache";

export async function invalidateDashboardStats() {
  await cacheDelExact("stats:dashboard");
}

export async function invalidateXtreamCategories() {
  await cacheDel("xtream:live_categories");
}

export async function invalidateEpgCache() {
  await cacheDel("epg:");
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
