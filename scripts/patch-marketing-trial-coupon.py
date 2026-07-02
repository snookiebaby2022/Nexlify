#!/usr/bin/env python3
"""Wire trial coupon banner + pricing checkout coupon on nexlify marketing site."""
from __future__ import annotations

from pathlib import Path

ROOT = Path("/var/www/nexlify")
DASHBOARD = ROOT / "src/app/dashboard/page.tsx"
PRICING_SECTION = ROOT / "src/components/PricingSection.tsx"
PRICING_CARDS = ROOT / "src/components/PricingCards.tsx"
LICENSING = ROOT / "src/lib/licensing.ts"
SCHEMA = ROOT / "prisma/schema.prisma"
TRIAL_START = ROOT / "src/app/api/trial/start/route.ts"


def patch_dashboard() -> None:
    text = DASHBOARD.read_text(encoding="utf-8")
    if "TrialCouponBanner" in text:
        print("dashboard: already patched")
        return
    text = text.replace(
        'import { TRIAL_PLAN_SLUG } from "@/lib/plans";',
        'import { TRIAL_PLAN_SLUG } from "@/lib/plans";\n'
        'import { TrialCouponBanner } from "@/components/TrialCouponBanner";',
        1,
    )
    old = """      {trialLicense && !trialExpired && (
        <div className="mt-8 glass rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-6">
          <p className="text-sm text-cyan-100">
            <strong className="text-white">Free trial active</strong> — expires{" "}
            {formatDate(trialLicense.expiresAt)}. Upgrade to keep full access after 7 days.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Upgrade plan →
          </Link>
        </div>
      )}"""
    new = """      {trialLicense && !trialExpired && (
        <>
          <div className="mt-8 glass rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-6">
            <p className="text-sm text-cyan-100">
              <strong className="text-white">Free trial active</strong> — expires{" "}
              {formatDate(trialLicense.expiresAt)}. Upgrade to keep full access after 7 days.
            </p>
            <Link
              href="/pricing"
              className="mt-4 inline-flex rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Upgrade plan →
            </Link>
          </div>
          <TrialCouponBanner expiresLabel={formatDate(trialLicense.expiresAt)} />
        </>
      )}"""
    if old not in text:
        raise SystemExit("dashboard trial block not found")
    DASHBOARD.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("dashboard: patched")


def patch_checkout_body(file: Path, fn_name: str) -> None:
    text = file.read_text(encoding="utf-8")
    if "readPendingCouponCode" in text:
        print(f"{file.name}: checkout coupon already patched")
        return
    if 'from "@/lib/marketing-coupon"' not in text:
        anchor = 'import { formatMoney } from "@/lib/format";'
        if anchor not in text:
            anchor = 'import { useState } from "react";'
        text = text.replace(
            anchor,
            anchor + '\nimport { readPendingCouponCode } from "@/lib/marketing-coupon";',
            1,
        )
    replacements = [
        (
            'body: JSON.stringify({ planId: plan.id }),',
            """body: JSON.stringify({
          planId: plan.id,
          couponCode: readPendingCouponCode() ?? undefined,
        }),""",
        ),
        (
            "body: JSON.stringify({ planId }),",
            """body: JSON.stringify({
          planId,
          couponCode: readPendingCouponCode() ?? undefined,
        }),""",
        ),
    ]
    for old, new in replacements:
        if old in text:
            file.write_text(text.replace(old, new, 1), encoding="utf-8")
            print(f"{file.name}: patched ({fn_name})")
            return
    raise SystemExit(f"{file.name}: checkout body not found")


def patch_licensing() -> None:
    text = LICENSING.read_text(encoding="utf-8")
    if "licenseDurationDays" in text:
        print("licensing: already patched")
        return
    old = "  const expiresAt = addDays(new Date(), order.plan.durationDays);"
    new = """  const durationDays = order.licenseDurationDays ?? order.plan.durationDays;
  const expiresAt = addDays(new Date(), durationDays);"""
    if old not in text:
        raise SystemExit("licensing expiresAt line not found")
    LICENSING.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("licensing: patched")


def patch_schema() -> None:
    text = SCHEMA.read_text(encoding="utf-8")
    if "couponCode" in text:
        print("schema: already patched")
        return
    old = "  amountCents     Int\n  status          OrderStatus @default(PENDING)"
    new = """  amountCents          Int
  couponCode           String?
  licenseDurationDays  Int?
  status               OrderStatus @default(PENDING)"""
    if old not in text:
        raise SystemExit("Order model block not found")
    SCHEMA.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("schema: patched")


def patch_trial_start() -> None:
    text = TRIAL_START.read_text(encoding="utf-8")
    if "trial_coupon=1" in text:
        print("trial/start: already patched")
        return
    text = text.replace(
        'redirect: "/dashboard"',
        'redirect: "/dashboard?trial_coupon=1"',
        1,
    )
    text = text.replace(
        'data.redirect ?? "/dashboard"',
        'data.redirect ?? "/dashboard?trial_coupon=1"',
        1,
    )
    TRIAL_START.write_text(text, encoding="utf-8")
    print("trial/start: patched")


def main() -> int:
    patch_dashboard()
    patch_checkout_body(PRICING_SECTION, "buy")
    patch_checkout_body(PRICING_CARDS, "checkout")
    patch_licensing()
    patch_schema()
    patch_trial_start()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
