/** Live connection quality derived from session heartbeat freshness. */

export type ConnectionQualityLevel = "excellent" | "ok" | "poor";

export type ConnectionQuality = {
  score: number;
  level: ConnectionQualityLevel;
  label: string;
};

/** Keep in sync with LIVE_STALE_MS in connections.ts */
export const LIVE_STALE_SEC = 180;

function levelFromScore(score: number): ConnectionQualityLevel {
  if (score >= 80) return "excellent";
  if (score >= 50) return "ok";
  return "poor";
}

/** Score from how recently the session was touched (lastSeenAt). HLS clients gap between requests — that is normal. */
export function scoreFromLastSeen(staleSec: number): number {
  if (staleSec <= 4) return 100;
  if (staleSec <= 8) return 98;
  if (staleSec <= 12) return 95;
  if (staleSec <= 18) return 92;
  if (staleSec <= 25) return 88;
  if (staleSec <= 45) return 82;
  if (staleSec <= 90) return 75;
  if (staleSec <= 120) return 70;
  if (staleSec <= 180) return 65;
  if (staleSec <= LIVE_STALE_SEC) return 60;
  return Math.max(8, 40 - Math.round((staleSec - LIVE_STALE_SEC) * 2));
}

export function computeConnectionQuality(opts: {
  startedAt: Date | string;
  lastSeenAt: Date | string;
  now?: number;
}): ConnectionQuality {
  const now = opts.now ?? Date.now();
  const lastSeenMs = new Date(opts.lastSeenAt).getTime();
  const staleSec = Math.max(0, (now - lastSeenMs) / 1000);
  const score = scoreFromLastSeen(staleSec);
  const level = levelFromScore(score);
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

/** Session stall count that means the player is actually buffering, not a zap. */
export const STALL_PROBLEM_COUNT = 5;

export const LIVE_STALL_HELP =
  "A stall is counted when an edge heartbeat arrives after 45+ seconds with almost no video bytes. 15s batched pulses that still carry a full video payload are metering, not buffering. 0 is healthy. 1–4 in a session is usually a zap or a brief hiccup. 5+ means the player is actually stalling. Quality % is heartbeat freshness, not the stall count.";

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
