import { getSettingGroup } from "@/lib/panel-settings";
import { cacheGet, cacheSet } from "@/lib/cache";

export const IPTV_TRIALS_DISABLED_ERROR =
  "Trial subscriptions (24 hours / 48 hours) are disabled";

export const IPTV_TRIAL_RATE_LIMIT_ERROR =
  "Too many trial subscriptions from this network — try again tomorrow";

/** 24h and 48h trial packages / presets. */
export function isIptvTrialDurationDays(days: number): boolean {
  const n = Math.floor(Number(days));
  return n === 1 || n === 2;
}

/** Paid 1–2 day SKUs are not trials; free short packages and names containing "trial" are. */
export function isIptvTrialPackageMeta(pkg: {
  name?: string;
  days: number;
  creditCost: number;
  shopPriceCents?: number;
}): boolean {
  if (/\btrial\b/i.test(String(pkg.name ?? ""))) return true;
  const paid = pkg.creditCost > 0 || (pkg.shopPriceCents ?? 0) > 0;
  if (paid) return false;
  return isIptvTrialDurationDays(pkg.days);
}

export function isIptvTrialSubscription(opts: {
  isTrial?: boolean;
  days?: number;
  expiresAt?: Date | null;
  now?: Date;
}): boolean {
  return opts.isTrial === true;
}

export async function iptvTrialLinesDisabled(): Promise<boolean> {
  const general = await getSettingGroup("general");
  return general.disableTrial === true;
}

/** Max free trials per client IP per UTC day (shop / abuse bots). 0 = unlimited. */
async function trialMaxPerIpPerDay(): Promise<number> {
  const general = await getSettingGroup("general");
  const n = Number(general.trialMaxPerIpPerDay ?? 3);
  if (!Number.isFinite(n) || n < 0) return 3;
  return Math.floor(n);
}

export async function assertIptvTrialAllowed(opts: {
  isTrial?: boolean;
  days?: number;
  expiresAt?: Date | null;
  clientIp?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isIptvTrialSubscription(opts)) return { ok: true };
  if (await iptvTrialLinesDisabled()) {
    return { ok: false, error: IPTV_TRIALS_DISABLED_ERROR };
  }

  const max = await trialMaxPerIpPerDay();
  const ip = String(opts.clientIp ?? "").trim();
  if (max > 0 && ip) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `trial:ip:${day}:${ip}`;
    const prev = Number((await cacheGet<number>(key)) ?? 0) || 0;
    if (prev >= max) {
      return { ok: false, error: IPTV_TRIAL_RATE_LIMIT_ERROR };
    }
    await cacheSet(key, prev + 1, 86_400);
  }
  return { ok: true };
}
