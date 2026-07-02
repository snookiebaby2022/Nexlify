import { prisma } from "@/lib/prisma";

import { isFreePeriod } from "./free-period";

export type CouponPublicView = {
  code: string;
  label: string | null;
  percentOff: number;
  discountMonths: number | null;
  maxRedemptions: number;
  redemptionCount: number;
  remaining: number | null;
  active: boolean;
  expired: boolean;
  soldOut: boolean;
};

export function couponRemaining(maxUses: number, uses: number): number | null {
  if (maxUses <= 0) return null;
  return Math.max(0, maxUses - uses);
}

export function toCouponPublicView(coupon: {
  code: string;
  label: string | null;
  discountType: string;
  discountValue: number;
  discountMonths?: number | null;
  maxUses: number;
  uses: number;
  isActive: boolean;
  expiresAt: Date | null;
}): CouponPublicView {
  const expired = Boolean(coupon.expiresAt && coupon.expiresAt < new Date());
  const remaining = couponRemaining(coupon.maxUses, coupon.uses);
  const soldOut = coupon.maxUses > 0 && coupon.uses >= coupon.maxUses;
  let percentOff = coupon.discountType === "percent" ? coupon.discountValue : 0;

  // During free period (until Aug 1, 2026), all coupons give 100% off
  if (isFreePeriod()) {
    percentOff = 100;
  }

  return {
    code: coupon.code,
    label: coupon.label,
    percentOff,
    discountMonths: coupon.discountMonths ?? null,
    maxRedemptions: coupon.maxUses,
    redemptionCount: coupon.uses,
    remaining,
    active: coupon.isActive && !expired && !soldOut,
    expired,
    soldOut,
  };
}

/** Atomically increment redemption count when under maxUses. Returns null if limit reached. */
export async function redeemCouponCode(code: string) {
  const normalized = code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code: normalized } });
  if (!coupon || !coupon.isActive) return { ok: false as const, error: "Invalid coupon" };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { ok: false as const, error: "Coupon expired" };
  }

  if (coupon.maxUses > 0) {
    const updated = await prisma.coupon.updateMany({
      where: {
        id: coupon.id,
        isActive: true,
        uses: { lt: coupon.maxUses },
      },
      data: { uses: { increment: 1 } },
    });
    if (updated.count !== 1) {
      return { ok: false as const, error: "Coupon fully redeemed" };
    }
    const fresh = await prisma.coupon.findUnique({ where: { id: coupon.id } });
    if (!fresh) return { ok: false as const, error: "Not found" };
    return {
      ok: true as const,
      uses: fresh.uses,
      remaining: couponRemaining(fresh.maxUses, fresh.uses),
    };
  }

  const fresh = await prisma.coupon.update({
    where: { id: coupon.id },
    data: { uses: { increment: 1 } },
  });
  return { ok: true as const, uses: fresh.uses, remaining: null };
}
