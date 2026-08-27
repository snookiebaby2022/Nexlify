import { getSettingGroup } from "@/lib/panel-settings";

export const IPTV_TRIALS_DISABLED_ERROR =
  "Trial subscriptions (24 hours / 48 hours) are disabled";

/** 24h and 48h trial packages / presets. */
export function isIptvTrialDurationDays(days: number): boolean {
  const n = Math.floor(Number(days));
  return n === 1 || n === 2;
}

export function isIptvTrialSubscription(opts: {
  isTrial?: boolean;
  days?: number;
  expiresAt?: Date | null;
  now?: Date;
}): boolean {
  if (opts.isTrial === true) return true;
  if (opts.days != null && isIptvTrialDurationDays(opts.days)) return true;
  if (opts.expiresAt && !Number.isNaN(opts.expiresAt.getTime())) {
    const hours = (opts.expiresAt.getTime() - (opts.now ?? new Date()).getTime()) / 3600000;
    if (hours > 0 && hours <= 49) return true;
  }
  return false;
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
