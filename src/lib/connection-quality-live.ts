import { cacheGet, cacheSet, cacheDel } from "@/lib/cache";
import {
  computeConnectionQuality,
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

/** Quality from measured throughput + stall time (falls back to heartbeat heuristic). */
export function computeConnectionQualityWithLive(opts: {
  startedAt: Date | string;
  lastSeenAt: Date | string;
  now?: number;
  live?: LiveQualitySample | null;
}): ConnectionQuality {
  const now = opts.now ?? Date.now();
  const lastSeenMs = new Date(opts.lastSeenAt).getTime();
  const staleSec = Math.max(0, (now - lastSeenMs) / 1000);
  let live = opts.live;

  // Active row in the live list but no Redis samples yet (edge auth-only path).
  if (!live?.hasSamples && staleSec <= 24) {
    live = {
      bytesPerSec: staleSec <= 6 ? 520_000 : 340_000,
      lastByteAt: lastSeenMs,
      totalBytes: 1,
      stallSec: staleSec,
      hasSamples: true,
    };
  }

  if (live?.hasSamples) {
    let bps = live.bytesPerSec;
    const stall = live.stallSec;

    // Playlist-only heartbeats can under-report; floor for still-active sessions.
    if (staleSec <= 20) {
      bps = Math.max(bps, 280_000);
    }

    let score: number;
    if (stall >= 12) {
      score = Math.max(5, 35 - Math.min(25, Math.round(stall - 12)));
    } else if (bps >= 800_000) {
      score = Math.min(100, 92 + Math.min(8, Math.round(bps / 1_000_000)));
    } else if (bps >= 400_000) {
      score = Math.min(100, 85 + Math.min(14, Math.round((bps - 400_000) / 50_000)));
    } else if (bps >= 150_000) {
      score = 72 + Math.min(12, Math.round((bps - 150_000) / 25_000));
    } else if (bps >= 50_000) {
      score = 55 + Math.min(16, Math.round((bps - 50_000) / 12_500));
    } else if (bps >= 15_000) {
      score = 38 + Math.min(16, Math.round((bps - 15_000) / 5_000));
    } else {
      score = Math.max(10, Math.round((bps / 15_000) * 36));
    }

    // Penalize brief stalls while bytes are still trickling
    if (stall >= 4 && stall < 12) score = Math.max(25, score - Math.round(stall * 2));

    score = Math.round(Math.min(100, Math.max(0, score)));

    let level: ConnectionQualityLevel;
    if (score >= 80) level = "excellent";
    else if (score >= 50) level = "ok";
    else level = "poor";

    return { score, level, label: `${score}%` };
  }

  return computeConnectionQuality({
    startedAt: opts.startedAt,
    lastSeenAt: opts.lastSeenAt,
    now,
  });
}
