import { cacheGet, cacheSet, cacheDel } from "@/lib/cache";
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
  hasSamples: boolean;
};

type QualityWindow = {
  windowStart: number;
  windowBytes: number;
  totalBytes: number;
  lastByteAt: number;
  peakBytesPerSec: number;
};

const QUALITY_TTL_SEC = 180;
const WINDOW_MS = 10_000;

export function connectionQualityKey(lineId: string, streamId: string, ip: string) {
  return `conn:q:${lineId}:${streamId}:${ip || "*"}`;
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
  let window: QualityWindow = prev ?? {
    windowStart: now,
    windowBytes: 0,
    totalBytes: 0,
    lastByteAt: now,
    peakBytesPerSec: 0,
  };

  window.windowBytes += byteLen;
  window.totalBytes += byteLen;
  window.lastByteAt = now;

  const elapsed = Math.max(1, now - window.windowStart);
  if (elapsed >= WINDOW_MS) {
    const bps = Math.round((window.windowBytes * 1000) / elapsed);
    window.peakBytesPerSec = Math.max(window.peakBytesPerSec, bps);
    window.windowStart = now;
    window.windowBytes = 0;
  }

  await cacheSet(key, window, QUALITY_TTL_SEC);
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
    hasSamples: true,
  };
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
