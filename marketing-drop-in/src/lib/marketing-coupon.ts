export const NEXLIFY_LAUNCH_COUPON = "NEXLIFY50";
export const COUPON_DISMISS_KEY = "nexlify_coupon_dismissed";
export const PENDING_COUPON_KEY = "nexlify_pending_coupon";

export const PANEL_COUPON_API =
  process.env.NEXT_PUBLIC_PANEL_URL?.replace(/\/+$/, "") ??
  "https://panel.nexlify.live";

/** Free launch period: all licenses are free until 2026-08-01 00:00:00 UTC */
export const FREE_PERIOD_END = new Date("2026-08-01T00:00:00Z");

export function isFreePeriod(): boolean {
  return new Date() < FREE_PERIOD_END;
}

export type PanelCouponView = {
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

export function readPendingCouponCode(): string | null {
  if (typeof window === "undefined") return null;
  const code = sessionStorage.getItem(PENDING_COUPON_KEY)?.trim().toUpperCase();
  return code || null;
}

export function storePendingCoupon(code: string = NEXLIFY_LAUNCH_COUPON) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_COUPON_KEY, code.trim().toUpperCase());
  sessionStorage.setItem(COUPON_DISMISS_KEY, "1");
}

export async function fetchPanelCoupon(
  code: string = NEXLIFY_LAUNCH_COUPON,
): Promise<PanelCouponView | null> {
  const res = await fetch(
    `${PANEL_COUPON_API}/api/billing/coupon?code=${encodeURIComponent(code)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.coupon ?? null;
}

export function couponCheckoutTotals(
  priceCents: number,
  durationDays: number,
  coupon: Pick<PanelCouponView, "percentOff" | "discountMonths">,
) {
  const months = Math.max(1, coupon.discountMonths ?? 1);
  const licenseDurationDays = durationDays * months;
  const fullPriceCents = priceCents * months;
  const amountCents = Math.round(fullPriceCents * (1 - coupon.percentOff / 100));
  return { amountCents, licenseDurationDays, months };
}
