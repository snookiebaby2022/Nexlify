"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readPendingCouponCode } from "@/lib/marketing-coupon";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";

type PlanRef = { id: string; slug: string };

type PricingCheckoutLauncherProps = {
  plans: PlanRef[];
  loggedIn: boolean;
};

export function PricingCheckoutLauncher({ plans, loggedIn }: PricingCheckoutLauncherProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn || started.current) return;

    const trial = searchParams.get("trial") === "1";
    const checkoutPlanId = searchParams.get("checkout");
    if (!trial && !checkoutPlanId) return;

    started.current = true;

    let planId = checkoutPlanId ?? null;
    if (trial) {
      const trialPlan =
        plans.find((p) => p.slug === TRIAL_PLAN_SLUG) ??
        plans.find((p) => p.slug.includes("trial"));
      planId = trialPlan?.id ?? null;
    }

    if (!planId || planId.startsWith("fallback-")) {
      setError("Plan not available — refresh the page or contact support.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId,
            couponCode: readPendingCouponCode() ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Checkout failed");

        if (data.url) {
          window.location.href = data.url;
          return;
        }
        const path = data.redirect?.replace(/^https?:\/\/[^/]+/, "") || "/dashboard";
        router.replace("/pricing");
        router.push(path);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed");
      }
    })();
  }, [loggedIn, plans, router, searchParams]);

  if (!error) return null;

  return (
    <p className="mx-auto mt-4 max-w-xl text-center text-sm text-red-400" role="alert">
      {error}
    </p>
  );
}
