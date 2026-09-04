import { prisma } from "@/lib/prisma";

export type DiscountResult = {
  amountCents: number;
  couponCode: string | null;
  creditAppliedCents: number;
};

export async function applyCheckoutDiscounts(opts: {
  userId: string;
  planPriceCents: number;
  couponCode?: string | null;
}): Promise<DiscountResult | { error: string }> {
  let amount = Math.max(0, opts.planPriceCents);
  let couponCode: string | null = null;

  const raw = opts.couponCode?.trim().toUpperCase() ?? "";
  if (raw) {
    const coupon = await prisma.coupon.findUnique({ where: { code: raw } });
    if (!coupon || !coupon.active) return { error: "Invalid coupon" };
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return { error: "Coupon expired" };
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      return { error: "Coupon has no remaining uses" };
    }
    if (coupon.percentOff != null && coupon.percentOff > 0) {
      amount = Math.round(amount * (100 - Math.min(100, coupon.percentOff)) / 100);
    } else if (coupon.amountOffCents != null && coupon.amountOffCents > 0) {
      amount = Math.max(0, amount - coupon.amountOffCents);
    } else {
      return { error: "Coupon has no discount" };
    }
    couponCode = coupon.code;
    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { creditCents: true },
  });
  const credit = Math.max(0, user?.creditCents ?? 0);
  const creditApplied = Math.min(credit, amount);
  amount -= creditApplied;
  if (creditApplied > 0) {
    await prisma.user.update({
      where: { id: opts.userId },
      data: { creditCents: { decrement: creditApplied } },
    });
  }

  return { amountCents: amount, couponCode, creditAppliedCents: creditApplied };
}
