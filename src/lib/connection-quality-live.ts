import { cacheGet, cacheMget, cacheSet, cacheDel } from "@/lib/cache";
import { isConnectionQoeEnabled } from "@/lib/connection-qoe";
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

// Edge batches connection pulses every ~15s (IPTV_EDGE_SESSION_KEEPALIVE_MS).
// A delayed flush still carries the video that flowed during the wait — that is
// not a stall. Floor is > 2 keepalives + HTTP timeout so jitter cannot trip it.
export const STALL_GAP_MS = Math.max(
  45_000,
  Number(process.env.CONNECTION_STALL_GAP_MS || 45_000)
);
/** Below this, a late pulse is a dribble (playlist/keepalive), not a healthy TS batch. */
export const MIN_HEALTHY_PULSE_BYTES = 64_000;
/** Origin/fan idle inside a 15s pulse — long enough that a live player buffers. */
export const PLAYER_STALL_IDLE_MS = 2_500;
/** On-demand: provider + fan cold-start can sit quiet for several seconds before TS flows. */
export const ON_DEMAND_PLAYER_STALL_IDLE_MS = Math.max(
  8_000,
  Number(process.env.CONNECTION_ON_DEMAND_STALL_IDLE_MS || 8_000)
);
/** Do not count stalls until the session has warmed up (bytes or age). */
export const ON_DEMAND_STALL_WARMUP_MS = Math.max(
  45_000,
  Number(process.env.CONNECTION_ON_DEMAND_STALL_WARMUP_MS || 45_000)
);
export const ON_DEMAND_MIN_WARMUP_BYTES = 500_000;
export const ON_DEMAND_STALL_GAP_MS = Math.max(
  60_000,
  Number(process.env.CONNECTION_ON_DEMAND_STALL_GAP_MS || 60_000)
);
const SESSION_RESET_GAP_MS = 120_000;

export type StallPulseContext = {
  onDemand?: boolean;
  sessionAgeMs?: number;
  totalBytesBefore?: number;
};

const QUALITY_TTL_SEC = 180;
const WINDOW_MS = 10_000;

export function connectionQualityKey(lineId: string, streamId: string, ip: string) {
  return `conn:q:${lineId}:${streamId}:${ip || "*"}`;
}

function freshQualityWindow(now: number, byteLen: number): QualityWindow {
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

/** True when this sample is a batched healthy pipe, not a buffering gap. */
export function pulseLooksLikeStall(
  gapMs: number,
  byteLen: number,
  idleMs = 0,
  ctx?: StallPulseContext
): boolean {
  if (ctx?.onDemand) {
    const age = ctx.sessionAgeMs ?? 0;
    const prevBytes = ctx.totalBytesBefore ?? 0;
    const stillWarming =
      age < ON_DEMAND_STALL_WARMUP_MS && prevBytes < ON_DEMAND_MIN_WARMUP_BYTES;
    if (stillWarming) return false;
    if (idleMs >= ON_DEMAND_PLAYER_STALL_IDLE_MS) return true;
    if (gapMs < ON_DEMAND_STALL_GAP_MS) return false;
    return byteLen < MIN_HEALTHY_PULSE_BYTES;
  }
  if (idleMs >= PLAYER_STALL_IDLE_MS) return true;
  if (gapMs < STALL_GAP_MS) return false;
  return byteLen < MIN_HEALTHY_PULSE_BYTES;
}

/** Apply inbound media bytes to a QoE window.
 *  Edge pulses are batched: 2MB after 30s is delayed metering, not a stall.
 *  idleMs is origin silence inside that batch (player-visible buffering). */
export function applyMediaByteWindow(
  prev: QualityWindow | null | undefined,
  now: number,
  byteLen: number,
  idleMs = 0,
  onDemand = false
): QualityWindow {
  const bytes = Math.max(0, byteLen);
  if (!prev || prev.totalBytes <= 0) {
    return freshQualityWindow(now, bytes);
  }
  const gap = now - prev.lastByteAt;
  if (gap >= SESSION_RESET_GAP_MS) {
    const next = freshQualityWindow(now, bytes);
    next.totalBytes = prev.totalBytes + bytes;
    return next;
  }
  const stallCount = pulseLooksLikeStall(gap, bytes, idleMs, {
    onDemand,
    sessionAgeMs: now - (prev.firstByteAt || prev.lastByteAt),
    totalBytesBefore: prev.totalBytes,
  })
    ? (prev.stallCount ?? 0) + 1
    : prev.stallCount ?? 0;
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
  byteLen: number,
  idleMs = 0,
  onDemand = false
): Promise<void> {
  if (!isConnectionQoeEnabled()) return;
  const idle = Math.max(0, Math.floor(idleMs || 0));
  const idleThreshold = onDemand ? ON_DEMAND_PLAYER_STALL_IDLE_MS : PLAYER_STALL_IDLE_MS;
  if (byteLen <= 0 && idle < idleThreshold) return;
  const key = connectionQualityKey(lineId, streamId, ip);
  const now = Date.now();
  const prev = await cacheGet<QualityWindow>(key);
  const next = applyMediaByteWindow(prev, now, byteLen, idle, onDemand);
  await cacheSet(key, next, QUALITY_TTL_SEC);
  const grew = (next.stallCount ?? 0) > (prev?.stallCount ?? 0);
  if (grew && next.stallCount >= 5 && next.totalBytes > 500_000) {
    const { logPlaybackQuality, PLAYBACK_STUTTER } = await import("./playback-quality-log");
    void logPlaybackQuality({
      action: PLAYBACK_STUTTER,
      streamId,
      lineId,
      detail: "Player-visible origin idle or empty edge pulse",
      meta: { stallCount: next.stallCount, bytesPerWindow: next.windowBytes, idleMs: idle },
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
  if (!isConnectionQoeEnabled()) {
    return items.map(() => null);
  }
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
