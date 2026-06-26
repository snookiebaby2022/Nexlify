"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  COUPON_DISMISS_KEY,
  fetchPanelCoupon,
  isFreePeriod,
  NEXLIFY_LAUNCH_COUPON,
  PENDING_COUPON_KEY,
  storePendingCoupon,
  type PanelCouponView,
} from "@/lib/marketing-coupon";

type CouponLaunchBannerProps = {
  isLoggedIn?: boolean;
};

export function CouponLaunchBanner({ isLoggedIn = false }: CouponLaunchBannerProps) {
  const [visible, setVisible] = useState(false);
  const [hasActiveTrial, setHasActiveTrial] = useState(false);
  const [coupon, setCoupon] = useState<PanelCouponView | null>(null);
  const claimHref = isLoggedIn ? "/pricing" : "/register";

  useEffect(() => {
    if (isFreePeriod()) return;
    if (!isLoggedIn) return;
    fetch("/api/trial/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasActiveTrial(Boolean(d?.active)))
      .catch(() => {});
  }, [isLoggedIn]);

  const shouldShowOnPath = useCallback(() => {
    if (isFreePeriod()) return false;
    if (typeof window === "undefined") return false;
    const path = window.location.pathname;
    if (path.startsWith("/register")) return false;
    if (path.startsWith("/livestream")) return false;
    if (sessionStorage.getItem(PENDING_COUPON_KEY) === NEXLIFY_LAUNCH_COUPON) return false;
    if (hasActiveTrial && (path.startsWith("/dashboard") || path.startsWith("/pricing"))) {
      return true;
    }
    if (path.startsWith("/pricing")) return sessionStorage.getItem(COUPON_DISMISS_KEY) !== "1";
    return sessionStorage.getItem(COUPON_DISMISS_KEY) !== "1";
  }, [hasActiveTrial]);

  useEffect(() => {
    if (isFreePeriod()) return;
    if (!shouldShowOnPath()) return;
    fetchPanelCoupon(NEXLIFY_LAUNCH_COUPON)
      .then((c) => {
        if (!c?.active) return;
        setCoupon(c);
        if (sessionStorage.getItem(COUPON_DISMISS_KEY) !== "1") {
          setVisible(true);
        }
      })
      .catch(() => {});
  }, [shouldShowOnPath]);

  function dismiss() {
    sessionStorage.setItem(COUPON_DISMISS_KEY, "1");
    setVisible(false);
  }

  function onClaim() {
    storePendingCoupon(NEXLIFY_LAUNCH_COUPON);
    trackEvent("coupon_claim", { coupon: NEXLIFY_LAUNCH_COUPON });
    void navigator.clipboard.writeText(NEXLIFY_LAUNCH_COUPON).catch(() => {});
  }

  if (isFreePeriod() || !visible || !coupon) return null;

  const months = coupon.discountMonths ?? 3;
  const remainingLabel =
    coupon.remaining != null && coupon.maxRedemptions > 0
      ? `${coupon.remaining} left`
      : null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] border-b border-cyan-500/30 bg-gradient-to-r from-cyan-950 via-[#0c1830] to-violet-950 shadow-lg shadow-black/30"
      role="region"
      aria-label="Launch offer"
      data-nx-offer-banner
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-2.5">
        <div className="min-w-0 flex-1 pr-8 sm:pr-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            {hasActiveTrial ? "Trial upgrade" : "Launch offer"}
          </p>
          <p className="mt-0.5 text-sm font-medium text-white sm:text-base">
            <span className="font-bold text-cyan-300">{coupon.percentOff}% off</span> your first{" "}
            {months} months — code{" "}
            <span className="font-mono text-cyan-200">{NEXLIFY_LAUNCH_COUPON}</span>
            {remainingLabel && (
              <span className="text-cyan-400/80"> · {remainingLabel}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href={claimHref}
            onClick={onClaim}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 transition-all"
          >
            {isLoggedIn
              ? hasActiveTrial
                ? "Upgrade with 50% off"
                : "Claim 50% off"
              : "Create account & claim"}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-slate-200 hover:border-cyan-400/40 hover:text-white transition-colors sm:hidden"
          >
            View pricing
          </Link>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white sm:static sm:h-9 sm:w-9 sm:shrink-0"
          aria-label="Dismiss offer"
        >
          <span className="text-xl leading-none" aria-hidden>
            ×
          </span>
        </button>
      </div>
    </div>
  );
}
