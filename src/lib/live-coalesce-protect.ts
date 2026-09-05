/**
 * Keep XUI-style FHD/HD/SD URL coalescing intact across provider/M3U sync.
 * If several active LIVE rows already share an upstream URL, do not retarget
 * one of them to a different provider path (that re-opens extra CDN pulls).
 */
import { liveUpstreamKey } from "@/lib/live-fleet-heal";

export function buildLiveUrlShareCounts(
  rows: { streamUrl: string | null | undefined }[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = liveUpstreamKey(String(r.streamUrl ?? ""));
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/**
 * @returns true when sync must keep `existingUrl` (do not write `incomingUrl`).
 */
export function shouldPreserveCoalescedLiveUrl(
  existingUrl: string,
  incomingUrl: string,
  urlShareCount: Map<string, number>
): boolean {
  const existingKey = liveUpstreamKey(existingUrl);
  const incomingKey = liveUpstreamKey(incomingUrl);
  if (!existingKey || !incomingKey) return false;
  if (existingKey === incomingKey) return false;
  return (urlShareCount.get(existingKey) || 0) >= 2;
}

/** Mutable helper when a retarget is allowed — share counts stay accurate mid-batch. */
export function noteLiveUrlShareChange(
  urlShareCount: Map<string, number>,
  fromUrl: string,
  toUrl: string
): void {
  const fromKey = liveUpstreamKey(fromUrl);
  const toKey = liveUpstreamKey(toUrl);
  if (fromKey && fromKey === toKey) return;
  if (fromKey) {
    const n = (urlShareCount.get(fromKey) || 1) - 1;
    if (n <= 0) urlShareCount.delete(fromKey);
    else urlShareCount.set(fromKey, n);
  }
  if (toKey) urlShareCount.set(toKey, (urlShareCount.get(toKey) || 0) + 1);
}
