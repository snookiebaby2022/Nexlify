import { cacheGet, cacheSet } from "@/lib/cache";
import { logActivity } from "@/lib/lines";

export const PLAYBACK_FREEZE = "playback_freeze";
export const PLAYBACK_STUTTER = "playback_stutter";
export const PLAYBACK_DROP = "playback_drop";
export const PLAYBACK_ORIGIN_FAIL = "playback_origin_fail";
export const PLAYBACK_FAILOVER = "playback_failover";

export const PLAYBACK_QUALITY_ACTIONS = [
  PLAYBACK_FREEZE,
  PLAYBACK_STUTTER,
  PLAYBACK_DROP,
  PLAYBACK_ORIGIN_FAIL,
  PLAYBACK_FAILOVER,
] as const;

const DEBOUNCE_SEC = 120;

export async function logPlaybackQuality(opts: {
  action: (typeof PLAYBACK_QUALITY_ACTIONS)[number];
  streamId: string;
  streamName?: string;
  lineId?: string;
  detail?: string;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  const key = `playback:log:${opts.action}:${opts.streamId}`;
  if (await cacheGet<string>(key)) return false;
  await cacheSet(key, "1", DEBOUNCE_SEC);
  await logActivity(opts.action, {
    lineId: opts.lineId,
    entity: "stream",
    entityId: opts.streamId,
    meta: {
      name: opts.streamName,
      detail: opts.detail,
      ...opts.meta,
    },
  });
  return true;
}
