import { getSettingGroup } from "@/lib/panel-settings";

export const IPTV_TRIALS_DISABLED_ERROR =
  "Trial subscriptions (24 hours / 48 hours) are disabled";

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

export async function assertIptvTrialAllowed(opts: {
  isTrial?: boolean;
  days?: number;
  expiresAt?: Date | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isIptvTrialSubscription(opts)) return { ok: true };
  if (await iptvTrialLinesDisabled()) {
    return { ok: false, error: IPTV_TRIALS_DISABLED_ERROR };
  }
  return { ok: true };
}
