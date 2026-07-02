#!/usr/bin/env python3
from pathlib import Path

DASHBOARD = Path("/var/www/nexlify/src/app/dashboard/page.tsx")


def main() -> int:
    text = DASHBOARD.read_text(encoding="utf-8")
    if "TrialCouponRedirect" in text:
        print("dashboard redirect: already patched")
        return 0
    if 'import { Suspense } from "react";' not in text:
        text = text.replace(
            'import Link from "next/link";',
            'import Link from "next/link";\nimport { Suspense } from "react";',
            1,
        )
    text = text.replace(
        'import { TrialCouponBanner } from "@/components/TrialCouponBanner";',
        'import { TrialCouponBanner } from "@/components/TrialCouponBanner";\n'
        'import { TrialCouponRedirect } from "@/components/TrialCouponRedirect";',
        1,
    )
    anchor = "      <h1 className=\"font-display text-3xl font-bold text-white\">My licenses</h1>"
    if anchor not in text:
        raise SystemExit("dashboard h1 anchor not found")
    text = text.replace(
        anchor,
        "      <Suspense fallback={null}>\n        <TrialCouponRedirect />\n      </Suspense>\n      "
        + anchor,
        1,
    )
    DASHBOARD.write_text(text, encoding="utf-8")
    print("dashboard redirect: patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
