"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  COUPON_DISMISS_KEY,
  fetchPanelCoupon,
  NEXLIFY_LAUNCH_COUPON,
  PENDING_COUPON_KEY,
  storePendingCoupon,
  type PanelCouponView,
} from "@/lib/marketing-coupon";

const OFFER_DELAY_MS = 8000;

type CouponLaunchPopupProps = {
  isLoggedIn?: boolean;
};

export function CouponLaunchPopup({ isLoggedIn = false }: CouponLaunchPopupProps) {
  const [open, setOpen] = useState(false);
  const [hasActiveTrial, setHasActiveTrial] = useState(false);
  const [coupon, setCoupon] = useState<PanelCouponView | null>(null);
  const claimHref = isLoggedIn ? "/pricing" : "/register";

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch("/api/trial/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasActiveTrial(Boolean(d?.active)))
      .catch(() => {});
  }, [isLoggedIn]);

  const shouldShowOnPath = useCallback(() => {
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
    if (!shouldShowOnPath()) return;
    fetchPanelCoupon(NEXLIFY_LAUNCH_COUPON)
      .then((c) => {
        if (!c?.active) return;
        setCoupon(c);
      })
      .catch(() => {});
  }, [shouldShowOnPath]);

  useEffect(() => {
    if (!coupon || sessionStorage.getItem(COUPON_DISMISS_KEY) === "1") return;

    const show = () => setOpen(true);
    const timer = window.setTimeout(show, OFFER_DELAY_MS);
    const onExitIntent = (event: MouseEvent) => {
      if (event.clientY < 10) show();
    };
    document.addEventListener("mouseleave", onExitIntent);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseleave", onExitIntent);
    };
  }, [coupon]);

  function dismiss() {
    sessionStorage.setItem(COUPON_DISMISS_KEY, "1");
    setOpen(false);
  }

  function onClaim() {
    storePendingCoupon(NEXLIFY_LAUNCH_COUPON);
    trackEvent("coupon_claim", { coupon: NEXLIFY_LAUNCH_COUPON });
    void navigator.clipboard.writeText(NEXLIFY_LAUNCH_COUPON).catch(() => {});
  }

  if (!open || !coupon) return null;

  const months = coupon.discountMonths ?? 3;
  const remainingLabel =
    coupon.remaining != null && coupon.maxRedemptions > 0
      ? `${coupon.remaining} of ${coupon.maxRedemptions} left`
      : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(10,22,40,0.72)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="coupon-title"
      data-nx-offer-open
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
        style={{ borderColor: "#1e3a5f", background: "#111b2e" }}
      >
        <div className="px-6 py-5 space-y-4">
          <div className="flex justify-between items-start gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest font-medium" style={{ color: "#22d3ee" }}>
                {hasActiveTrial ? "Trial upgrade offer" : "Limited launch offer"}
              </p>
              <h2 id="coupon-title" className="text-2xl font-bold text-white mt-1">
                {coupon.percentOff}% off your first {months} months
              </h2>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="text-slate-400 hover:text-white text-xl leading-none cursor-pointer"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>

          <p className="text-sm" style={{ color: "#94a3b8" }}>
            {hasActiveTrial ? (
              <>
                Upgrade before your trial ends and save on your first {months} months with code{" "}
                <strong className="text-cyan-300 font-mono">{NEXLIFY_LAUNCH_COUPON}</strong>.
              </>
            ) : (
              <>
                Use code <strong className="text-cyan-300 font-mono">{NEXLIFY_LAUNCH_COUPON}</strong> at
                checkout.
              </>
            )}
            {remainingLabel && (
              <>
                {" "}
                <span className="text-cyan-400/90">({remainingLabel})</span>
              </>
            )}
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <Link
              href={claimHref}
              onClick={onClaim}
              className="flex-1 rounded-full py-2.5 px-4 font-semibold text-sm cursor-pointer text-center"
              style={{ background: "#22d3ee", color: "#0a1628" }}
            >
              {isLoggedIn
                ? hasActiveTrial
                  ? "Upgrade with 50% off"
                  : "Claim 50% off"
                : "Create account & claim"}
            </Link>
            <Link
              href="/pricing"
              onClick={dismiss}
              className="text-center rounded-full py-2.5 px-4 text-sm border"
              style={{ borderColor: "#1e3a5f", color: "#94a3b8" }}
            >
              View pricing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
