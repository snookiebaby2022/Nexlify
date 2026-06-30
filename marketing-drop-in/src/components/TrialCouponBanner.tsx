"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  NEXLIFY_LAUNCH_COUPON,
  storePendingCoupon,
} from "@/lib/marketing-coupon";

type TrialCouponBannerProps = {
  expiresLabel: string;
};

export function TrialCouponBanner({ expiresLabel }: TrialCouponBannerProps) {
  useEffect(() => {
    storePendingCoupon(NEXLIFY_LAUNCH_COUPON);
  }, []);

  return (
    <div className="mt-8 glass rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
        Trial upgrade offer
      </p>
      <h2 className="mt-2 text-xl font-bold text-white">
        50% off your first 3 months
      </h2>
      <p className="mt-2 text-sm text-cyan-100/90">
        Your free trial expires {expiresLabel}. Use code{" "}
        <strong className="font-mono text-cyan-200">{NEXLIFY_LAUNCH_COUPON}</strong> at
        checkout — already saved for your account.
      </p>
      <Link
        href="/pricing"
        className="mt-4 inline-flex rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110"
      >
        Upgrade with 50% off →
      </Link>
    </div>
  );
}
