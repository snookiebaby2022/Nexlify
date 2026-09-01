import { cacheGet, cacheMget, cacheSet, cacheDel } from "@/lib/cache";
import {
  computeConnectionQuality,
  scoreFromLastSeen,
  LIVE_STALE_SEC,
  type ConnectionQuality,
  type ConnectionQualityLevel,
} from "@/lib/connection-quality";

export type LiveQualitySample = {
  bytesPerSec: number;
  lastByteAt: number;
  totalBytes: number;
  stallSec: number;
  stallCount: number;
  firstByteAt: number;
  hasSamples: boolean;
};

export type QualityWindow = {
  windowStart: number;
  windowBytes: number;
  totalBytes: number;
  lastByteAt: number;
  peakBytesPerSec: number;
  firstByteAt: number;
  stallCount: number;
};

// Edge batches connection pulses every ~15s (IPTV_EDGE_SESSION_KEEPALIVE_MS) to avoid
// overloading the panel. Gaps below ~20s are normal keepalive spacing, not stalls.
export const STALL_GAP_MS = Math.max(
  20_000,
  Number(process.env.CONNECTION_STALL_GAP_MS || 20_000)
);

/** Session stall count that means the player is actually buffering, not a zap. */
export const STALL_PROBLEM_COUNT = 5;

export const LIVE_STALL_HELP =
  "A stall is counted when no video bytes arrive for 20+ seconds. Shorter gaps are normal keepalive, not buffering. 0 is healthy. 1–4 in a session is usually a channel change or a brief hiccup. 5+ means the player is stalling — check that channel’s source or the load balancer. Quality % is how fresh the session heartbeat is, not the stall count.";

export function describeStallCount(stallCount: number): {
  level: "ok" | "watch" | "bad";
  summary: string;
} {
  const n = Math.max(0, Math.floor(Number(stallCount) || 0));
  if (n <= 0) return { level: "ok", summary: "0 stalls — normal" };
  if (n < STALL_PROBLEM_COUNT) {
    return {
      level: "watch",
      summary: `${n} stall${n === 1 ? "" : "s"} — occasional, usually fine`,
    };
  }
  return { level: "bad", summary: `${n} stalls — buffering, check source or LB` };
}

const QUALITY_TTL_SEC = 180;
const WINDOW_MS = 10_000;

export function connectionQualityKey(lineId: string, streamId: string, ip: string) {
  return `conn:q:${lineId}:${streamId}:${ip || "*"}`;
}

/** Apply inbound media bytes to a QoE window (stalls = gaps longer than STALL_GAP_MS). */
export function applyMediaByteWindow(
  prev: QualityWindow | null | undefined,
  now: number,
  byteLen: number
): QualityWindow {
  if (!prev || prev.totalBytes <= 0) {
    return {
      windowStart: now,
      windowBytes: Math.max(0, byteLen),
      totalBytes: Math.max(0, byteLen),
      lastByteAt: now,
      peakBytesPerSec: 0,
      firstByteAt: now,
      stallCount: 0,
    };
  }
  const gap = now - prev.lastByteAt;
  const stallCount = gap >= STALL_GAP_MS ? (prev.stallCount ?? 0) + 1 : prev.stallCount ?? 0;
  const window: QualityWindow = {
    windowStart: prev.windowStart,
    windowBytes: prev.windowBytes + Math.max(0, byteLen),
    totalBytes: prev.totalBytes + Math.max(0, byteLen),
    lastByteAt: now,
    peakBytesPerSec: prev.peakBytesPerSec,
    firstByteAt: prev.firstByteAt || now,
    stallCount,
  };
  const elapsed = Math.max(1, now - window.windowStart);
  if (elapsed >= WINDOW_MS) {
    const bps = Math.round((window.windowBytes * 1000) / elapsed);
    window.peakBytesPerSec = Math.max(window.peakBytesPerSec, bps);
    window.windowStart = now;
    window.windowBytes = 0;
  }
  return window;
}

/** Record media bytes flowing through a live proxy (called from attachKickAwareProxyBody). */
export async function recordConnectionMediaBytes(
  lineId: string,
  streamId: string,
  ip: string,
  byteLen: number
): Promise<void> {
  if (byteLen <= 0) return;
  const key = connectionQualityKey(lineId, streamId, ip);
  const now = Date.now();
  const prev = await cacheGet<QualityWindow>(key);
  const next = applyMediaByteWindow(prev, now, byteLen);
  await cacheSet(key, next, QUALITY_TTL_SEC);
  const grew = (next.stallCount ?? 0) > (prev?.stallCount ?? 0);
  if (grew && next.stallCount >= 5 && next.totalBytes > 500_000) {
    const { logPlaybackQuality, PLAYBACK_STUTTER } = await import("./playback-quality-log");
    void logPlaybackQuality({
      action: PLAYBACK_STUTTER,
      streamId,
      lineId,
      detail: "Byte gaps over 2.5s while the player was still pulling",
      meta: { stallCount: next.stallCount, bytesPerWindow: next.windowBytes },
    });
  }
}

export async function clearConnectionQuality(lineId: string, streamId: string, ip: string) {
  await cacheDel(connectionQualityKey(lineId, streamId, ip));
}

export async function getLiveQualitySample(
  lineId: string,
  streamId: string,
  ip: string | null | undefined,
  now = Date.now()
): Promise<LiveQualitySample | null> {
  if (!lineId || !streamId) return null;

  const keys = new Set<string>();
  const raw = ip?.trim() ?? "";
  if (raw) keys.add(raw);
  keys.add("");
  keys.add("*");

  let window: QualityWindow | null = null;
  for (const k of keys) {
    const hit = await cacheGet<QualityWindow>(connectionQualityKey(lineId, streamId, k));
    if (hit && hit.totalBytes > 0) {
      window = hit;
      break;
    }
  }
  if (!window) return null;

  return qualitySampleFromWindow(window, now);
}

function qualitySampleFromWindow(window: QualityWindow, now: number): LiveQualitySample {
  const stallSec = Math.max(0, (now - window.lastByteAt) / 1000);
  const elapsed = Math.max(1, now - window.windowStart);
  const currentBps =
    window.windowBytes > 0 ? Math.round((window.windowBytes * 1000) / elapsed) : 0;
  const bytesPerSec = Math.max(window.peakBytesPerSec, currentBps);
  return {
    bytesPerSec,
    lastByteAt: window.lastByteAt,
    totalBytes: window.totalBytes,
    stallSec,
    stallCount: window.stallCount ?? 0,
    firstByteAt: window.firstByteAt || window.lastByteAt,
    hasSamples: true,
  };
}

/** Batch quality reads for Live Connections page (one MGET). */
export async function batchGetLiveQualitySamples(
  items: Array<{ lineId: string; streamId: string; ip: string | null | undefined }>,
  now = Date.now()
): Promise<(LiveQualitySample | null)[]> {
  const flatKeys: string[] = [];
  const lookups: Array<{ itemIndex: number; keyIndexes: number[] }> = [];

  for (let i = 0; i < items.length; i++) {
    const { lineId, streamId, ip } = items[i]!;
    if (!lineId || !streamId) continue;
    const keyIndexes: number[] = [];
    const raw = ip?.trim() ?? "";
    if (raw) {
      keyIndexes.push(flatKeys.length);
      flatKeys.push(connectionQualityKey(lineId, streamId, raw));
    }
    keyIndexes.push(flatKeys.length);
    flatKeys.push(connectionQualityKey(lineId, streamId, ""));
    keyIndexes.push(flatKeys.length);
    flatKeys.push(connectionQualityKey(lineId, streamId, "*"));
    lookups.push({ itemIndex: i, keyIndexes });
  }

  const windows = flatKeys.length ? await cacheMget<QualityWindow>(flatKeys) : [];
  const out: (LiveQualitySample | null)[] = items.map(() => null);
  for (const { itemIndex, keyIndexes } of lookups) {
    let window: QualityWindow | null = null;
    for (const ki of keyIndexes) {
      const hit = windows[ki];
      if (hit && hit.totalBytes > 0) {
        window = hit;
        break;
      }
    }
    if (window) out[itemIndex] = qualitySampleFromWindow(window, now);
  }
  return out;
}

/**
 * Quality for Live Connections.
 * Primary signal: lastSeenAt freshness (HLS gaps between segment fetches are normal).
 * Throughput/stall only nudges the score — never tanks a healthy active session.
 */
export function computeConnectionQualityWithLive(opts: {
  startedAt: Date | string;
  lastSeenAt: Date | string;
  now?: number;
  live?: LiveQualitySample | null;
}): ConnectionQuality {
  const now = opts.now ?? Date.now();
  const lastSeenMs = new Date(opts.lastSeenAt).getTime();
  const staleSec = Math.max(0, (now - lastSeenMs) / 1000);

  let score = scoreFromLastSeen(staleSec);

  const live = opts.live;
  if (live?.hasSamples && staleSec <= LIVE_STALE_SEC) {
    // XUI-style: active row stays green; throughput can only boost, never downgrade.
    if (live.bytesPerSec >= 120_000) {
      score = Math.max(score, 98);
    }
  }

  score = Math.round(Math.min(100, Math.max(0, score)));
  const level: ConnectionQualityLevel =
    score >= 80 ? "excellent" : score >= 50 ? "ok" : "poor";

  return { score, level, label: `${score}%` };
}
