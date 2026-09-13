import type { PanelRole, Prisma } from "@prisma/client";
import { resolveLineCreateFromPackage } from "@/lib/package-line";
import { debitResellerCredits, sessionPaysLineCredits } from "@/lib/reseller-credit-charge";
import {
  extraConnectionSlots,
  remainingLineDaysForCredits,
  extraConnectionCreditCost,
  assertRoleMaySetUnlimitedConnections,
  applyResellerCreateConnections,
  RESELLER_UNLIMITED_CONNECTIONS_ERROR,
  RESELLER_EXPIRED_CONNECTION_ERROR,
} from "@/lib/line-connection-pricing";

export {
  extraConnectionSlots,
  remainingLineDaysForCredits,
  extraConnectionCreditCost,
  assertRoleMaySetUnlimitedConnections,
  applyResellerCreateConnections,
  RESELLER_UNLIMITED_CONNECTIONS_ERROR,
  RESELLER_EXPIRED_CONNECTION_ERROR,
};

type Tx = Prisma.TransactionClient;

export type ConnectionCreditResult = {
  charged: number;
  balanceAfter: number | null;
};

/** Debit reseller credits for extra simultaneous connections. */
export async function chargeLineConnectionCredits(
  tx: Tx,
  session: { id: string; role: PanelRole },
  opts: {
    extraSlots: number;
    remainingDays: number;
    packageId?: string | null;
    lineUsername: string;
  }
): Promise<ConnectionCreditResult> {
  if (!sessionPaysLineCredits(session.role)) {
    return { charged: 0, balanceAfter: null };
  }

  const extra = Math.floor(Number(opts.extraSlots));
  if (!Number.isFinite(extra) || extra <= 0) {
    return { charged: 0, balanceAfter: null };
  }

  const days = Math.floor(Number(opts.remainingDays));
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(RESELLER_EXPIRED_CONNECTION_ERROR);
  }

  const resolved = await resolveLineCreateFromPackage(
    {
      packageId: opts.packageId || undefined,
      days,
    },
    { sellerId: session.id }
  );
  const creditCost = extra * resolved.creditCost;
  if (creditCost <= 0) {
    return { charged: 0, balanceAfter: null };
  }

  let rewardPercent = 0;
  const { getResellerLineRewardPercent } = await import("@/lib/reseller-rewards");
  rewardPercent = await getResellerLineRewardPercent();

  const debit = await debitResellerCredits(tx, {
    userId: session.id,
    amount: creditCost,
    note: `Extra connections ×${extra} on ${opts.lineUsername}`,
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
