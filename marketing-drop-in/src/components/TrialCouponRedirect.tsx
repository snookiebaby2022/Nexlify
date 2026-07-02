"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { storePendingCoupon } from "@/lib/marketing-coupon";

/** After trial start, persist launch coupon for checkout. */
export function TrialCouponRedirect() {
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("trial_coupon") === "1") {
      storePendingCoupon();
    }
  }, [params]);

  return null;
}
