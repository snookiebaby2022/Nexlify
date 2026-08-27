import type { Prisma } from "@prisma/client";
import { getSettingGroup } from "@/lib/panel-settings";

export async function getResellerLineRewardPercent(): Promise<number> {
  const billing = await getSettingGroup("billing");
  const n = Number(billing.rewardPercentOnLineCreate ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(50, Math.max(0, Math.floor(n)));
}

/** Cashback after a reseller spends credits creating a line. */
export async function applyResellerLineReward(
  tx: Prisma.TransactionClient,
  opts: {
    userId: string;
    spent: number;
    percent: number;
    lineUsername: string;
  }
): Promise<number> {
  const rebate = Math.floor((opts.spent * Math.max(0, opts.percent)) / 100);
  if (rebate <= 0) return 0;
  const updated = await tx.panelUser.update({
    where: { id: opts.userId },
    data: { credits: { increment: rebate } },
    select: { credits: true },
  });
  await tx.creditTransaction.create({
    data: {
      userId: opts.userId,
      amount: rebate,
      balanceAfter: updated.credits,
      note: `Reward ${opts.percent}% on line ${opts.lineUsername}`,
    },
  });
  return rebate;
}
