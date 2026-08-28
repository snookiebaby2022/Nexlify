import type { PanelRole, Prisma } from "@prisma/client";
import { debitResellerCredits, sessionPaysLineCredits } from "@/lib/reseller-credit-charge";
import { resolveLineCreateFromPackage } from "@/lib/package-line";

type Tx = Prisma.TransactionClient;

export type RenewCreditResult = {
  charged: number;
  balanceAfter: number | null;
};

/** Debit reseller/sub-reseller credits for a line renewal by day count. */
export async function chargeLineRenewCredits(
  tx: Tx,
  session: { id: string; role: PanelRole },
  opts: { days: number; packageId?: string; lineUsername: string }
): Promise<RenewCreditResult> {
  if (!sessionPaysLineCredits(session.role)) {
    return { charged: 0, balanceAfter: null };
  }

  const days = Math.floor(Number(opts.days));
  if (!Number.isFinite(days) || days <= 0) {
    return { charged: 0, balanceAfter: null };
  }

  const resolved = await resolveLineCreateFromPackage(
    {
      packageId: opts.packageId,
      days,
    },
    { sellerId: session.id }
  );
  const creditCost = resolved.creditCost;
  if (creditCost <= 0) {
    return { charged: 0, balanceAfter: null };
  }

  let rewardPercent = 0;
  const { getResellerLineRewardPercent } = await import("@/lib/reseller-rewards");
  rewardPercent = await getResellerLineRewardPercent();

  const debit = await debitResellerCredits(tx, {
    userId: session.id,
    amount: creditCost,
    note: `Renew line ${opts.lineUsername} (+${days}d)`,
  });

  let balanceAfter = debit.balanceAfter;
  if (rewardPercent > 0) {
    const { applyResellerLineReward } = await import("@/lib/reseller-rewards");
    const rebate = await applyResellerLineReward(tx, {
      userId: session.id,
      spent: creditCost,
      percent: rewardPercent,
      lineUsername: opts.lineUsername,
    });
    if (rebate > 0) balanceAfter += rebate;
  }

  return { charged: debit.charged, balanceAfter };
}

/** Days added when moving expiry forward (0 if shortening or unchanged). */
export function renewDaysFromExpiryChange(currentExpiresAt: Date, nextExpiresAt: Date, now = new Date()): number {
  const baseMs = Math.max(currentExpiresAt.getTime(), now.getTime());
  const delta = nextExpiresAt.getTime() - baseMs;
  if (delta <= 0) return 0;
  return Math.max(1, Math.ceil(delta / 86400000));
}
