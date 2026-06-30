#!/usr/bin/env python3
"""Wire GoogleAnalytics into nexlify-web layout.tsx (run on VPS)."""
from __future__ import annotations

import sys
from pathlib import Path

LAYOUT = Path("/var/www/nexlify/src/app/layout.tsx")


def main() -> int:
    text = LAYOUT.read_text(encoding="utf-8")
    if "GoogleAnalytics" in text:
        print("layout.tsx already has GoogleAnalytics")
        return 0

    if 'import { UmamiAnalytics } from "@/components/UmamiAnalytics";' not in text:
        print("UmamiAnalytics import not found", file=sys.stderr)
        return 1

    text = text.replace(
        'import { UmamiAnalytics } from "@/components/UmamiAnalytics";',
        'import { GoogleAnalytics } from "@/components/GoogleAnalytics";\n'
        'import { GoogleAnalyticsPageView } from "@/components/GoogleAnalyticsPageView";\n'
        'import { UmamiAnalytics } from "@/components/UmamiAnalytics";',
        1,
    )

    if "<UmamiAnalytics />" not in text:
        print("UmamiAnalytics component not found", file=sys.stderr)
        return 1

    text = text.replace(
        "<UmamiAnalytics />",
        "<GoogleAnalytics />\n        <GoogleAnalyticsPageView />\n        <UmamiAnalytics />",
        1,
    )

    LAYOUT.write_text(text, encoding="utf-8")
    print("Patched layout.tsx with Google Analytics")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
