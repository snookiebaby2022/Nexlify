import type { PanelRole } from "@prisma/client";
import { isUnlimitedLineExpiry } from "@/lib/format";
import { effectiveCreditCost } from "@/lib/package-credits";

export const RESELLER_UNLIMITED_CONNECTIONS_ERROR =
  "Resellers cannot set unlimited connections. Extra connections are billed from your credits.";

export const RESELLER_EXPIRED_CONNECTION_ERROR =
  "Renew this line before adding connections.";

/** Slots to bill when raising max connections. Unlimited (0) → finite is free. */
export function extraConnectionSlots(current: number, requested: number): number {
  const cur = Math.floor(Number(current));
  const next = Math.floor(Number(requested));
  if (!Number.isFinite(next) || next <= 0) return 0;
  if (!Number.isFinite(cur) || cur <= 0) return 0;
  return Math.max(0, next - cur);
}

/** Remaining paid days used to price one extra connection. */
export function remainingLineDaysForCredits(expiresAt: Date, now = new Date()): number {
  if (isUnlimitedLineExpiry(expiresAt, now)) return 365;
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}

/** Client-side estimate (server still applies reseller markup). */
export function extraConnectionCreditCost(opts: {
  extraSlots: number;
  remainingDays: number;
  packageCreditCost?: number | null;
  isTrial?: boolean;
}): number {
  const extra = Math.floor(Number(opts.extraSlots));
  if (!Number.isFinite(extra) || extra <= 0) return 0;
  const days = Math.max(0, Math.floor(Number(opts.remainingDays) || 0));
  if (days <= 0) return 0;
  const slot = effectiveCreditCost(days, opts.packageCreditCost, opts.isTrial === true);
  return extra * Math.max(0, slot);
}

export function assertRoleMaySetUnlimitedConnections(
  role: PanelRole,
  maxConnections: number
): { ok: true } | { ok: false; error: string } {
  if (role === "ADMIN") return { ok: true };
  if (Math.floor(Number(maxConnections)) === 0) {
    return { ok: false, error: RESELLER_UNLIMITED_CONNECTIONS_ERROR };
  }
  return { ok: true };
}

export function applyResellerCreateConnections(opts: {
  role: PanelRole;
  includedConnections: number;
  requested: number | null;
}): { ok: true; maxConnections: number; extraSlots: number } | { ok: false; error: string } {
  const included = Math.max(1, Math.floor(Number(opts.includedConnections) || 1));
  if (opts.requested == null || !Number.isFinite(opts.requested)) {
    return { ok: true, maxConnections: included, extraSlots: 0 };
  }
  const requested = Math.floor(opts.requested);
  const unlimited = assertRoleMaySetUnlimitedConnections(opts.role, requested);
  if (!unlimited.ok) return unlimited;
  const next = Math.max(1, requested);
  return { ok: true, maxConnections: next, extraSlots: Math.max(0, next - included) };
}
