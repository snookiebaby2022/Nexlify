/** Live connection quality derived from session age + heartbeat freshness (no fake static dot). */

export type ConnectionQualityLevel = "excellent" | "ok" | "poor";

export type ConnectionQuality = {
  score: number;
  level: ConnectionQualityLevel;
  label: string;
};

/** Panel live proxies refresh lastSeenAt about every 10s while bytes flow. */
const HEARTBEAT_INTERVAL_SEC = 10;
/** Keep in sync with LIVE_STALE_MS in connections.ts */
const LIVE_STALE_SEC = 90;

export function computeConnectionQuality(opts: {
  startedAt: Date | string;
  lastSeenAt: Date | string;
  now?: number;
}): ConnectionQuality {
  const now = opts.now ?? Date.now();
  const startedMs = new Date(opts.startedAt).getTime();
  const lastSeenMs = new Date(opts.lastSeenAt).getTime();
  const ageSec = Math.max(0, (now - startedMs) / 1000);
  const staleSec = Math.max(0, (now - lastSeenMs) / 1000);

  // Heartbeat: how recently the proxy reported activity
  let heartbeat: number;
  if (staleSec <= HEARTBEAT_INTERVAL_SEC * 0.5) heartbeat = 100;
  else if (staleSec <= HEARTBEAT_INTERVAL_SEC) heartbeat = 90;
  else if (staleSec <= HEARTBEAT_INTERVAL_SEC * 1.5) heartbeat = 76;
  else if (staleSec <= HEARTBEAT_INTERVAL_SEC * 2) heartbeat = 58;
  else if (staleSec <= HEARTBEAT_INTERVAL_SEC * 3) heartbeat = 40;
  else if (staleSec <= LIVE_STALE_SEC) heartbeat = 22;
  else heartbeat = 8;

  // Stability: longer sessions with fresh heartbeats are healthier
  const stability = Math.min(100, Math.round((Math.min(ageSec, 900) / 900) * 100));

  // Brief warmup window — players often buffer/reconnect in the first seconds
  const warmup =
    ageSec < 5 ? 0.7 : ageSec < 15 ? 0.88 : ageSec < 30 ? 0.95 : 1;

  const score = Math.round(
    Math.min(100, Math.max(0, (heartbeat * 0.68 + stability * 0.32) * warmup))
  );

  let level: ConnectionQualityLevel;
  if (score >= 80) level = "excellent";
  else if (score >= 50) level = "ok";
  else level = "poor";

  return { score, level, label: `${score}%` };
}

export function connectionQualityClass(level: ConnectionQualityLevel): string {
  switch (level) {
    case "excellent":
      return "xui-quality-badge xui-quality-badge--excellent";
    case "ok":
      return "xui-quality-badge xui-quality-badge--ok";
    default:
      return "xui-quality-badge xui-quality-badge--poor";
  }
}
