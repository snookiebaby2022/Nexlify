import { cacheGet, cacheSet } from "@/lib/cache";
import { logActivity } from "@/lib/lines";

const THROTTLE_SEC = 300;

async function shouldLog(key: string): Promise<boolean> {
  const hit = await cacheGet<string>(key);
  if (hit) return false;
  await cacheSet(key, "1", THROTTLE_SEC);
  return true;
}

/** Log Xtream/M3U app login (player_api with no action) — throttled per line + IP. */
export async function logIptvLineLoginSuccess(opts: {
  lineId: string;
  lineUsername: string;
  ip: string;
  userAgent?: string | null;
}) {
  const key = `iptv-login-log:${opts.lineId}:${opts.ip}`;
  if (!(await shouldLog(key))) return;
  void logActivity("iptv_line_login", {
    lineId: opts.lineId,
    entity: "line",
    entityId: opts.lineId,
    meta: {
      lineUsername: opts.lineUsername,
      ip: opts.ip,
      userAgent: opts.userAgent?.slice(0, 200) ?? null,
    },
  });
}

export async function logIptvLineLoginFailed(opts: {
  username: string;
  ip: string;
  reason: "bad_credentials" | "denied";
  deny?: string;
  userAgent?: string | null;
}) {
  const key = `iptv-login-fail:${opts.username}:${opts.ip}`;
  if (!(await shouldLog(key))) return;
  void logActivity("iptv_line_login_failed", {
    entity: "line",
    meta: {
      username: opts.username,
      ip: opts.ip,
      reason: opts.reason,
      deny: opts.deny ?? null,
      userAgent: opts.userAgent?.slice(0, 200) ?? null,
    },
  });
}
