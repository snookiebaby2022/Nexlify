import type { PanelRole, Prisma } from "@prisma/client";
import { PanelRole as Role } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export function sessionPaysLineCredits(role: PanelRole): boolean {
  return role === Role.RESELLER || role === Role.SUB_RESELLER;
}

/** Debit reseller credits and write a credit ledger row. Throws on insufficient balance. */
export async function debitResellerCredits(
  tx: Tx,
  opts: {
    userId: string;
    amount: number;
    note: string;
  }
): Promise<{ balanceAfter: number; charged: number }> {
  const amount = Math.floor(Number(opts.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { balanceAfter: 0, charged: 0 };
  }

  const owner = await tx.panelUser.findUnique({
    where: { id: opts.userId },
    select: { credits: true },
  });
  if (!owner) throw new Error("Forbidden");
  if (owner.credits < amount) throw new Error("Insufficient credits");

  const afterDebit = await tx.panelUser.update({
    where: { id: opts.userId },
    data: { credits: { decrement: amount } },
    select: { credits: true },
  });

  await tx.creditTransaction.create({
    data: {
      userId: opts.userId,
      amount: -amount,
      balanceAfter: afterDebit.credits,
      note: opts.note,
    },
  });

  return { balanceAfter: afterDebit.credits, charged: amount };
}
