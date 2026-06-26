import { cacheDel } from "@/lib/cache";

export function playbackUrlCacheKey(lineId: string, streamId: string) {
  return `playback:url:${lineId}:${streamId}`;
}

export async function invalidatePlaybackUrlCache(streamId?: string) {
  if (streamId) {
    await cacheDel(`playback:url:*:${streamId}`);
    return;
  }
  await cacheDel("playback:url:");
}
