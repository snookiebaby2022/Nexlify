#!/usr/bin/env python3
"""Install CouponLaunchPopup on nexlify marketing site root layout (run on VPS)."""
from __future__ import annotations

from pathlib import Path

LAYOUT = Path("/var/www/nexlify/src/app/layout.tsx")
COMPONENT_SRC = Path("/var/www/nexlify/src/components/CouponLaunchPopup.tsx")
IMPORT_LINE = 'import { CouponLaunchPopup } from "@/components/CouponLaunchPopup";'
BODY_TAG = "<CouponLaunchPopup isLoggedIn={!!user} />"


def patch_layout() -> None:
    text = LAYOUT.read_text(encoding="utf-8")
    if IMPORT_LINE not in text:
        anchor = 'import "./globals.css";'
        if anchor not in text:
            raise SystemExit("layout.tsx globals import not found")
        text = text.replace(anchor, anchor + "\n" + IMPORT_LINE, 1)
    legacy_tag = "<CouponLaunchPopup />"
    if BODY_TAG not in text:
        if legacy_tag in text:
            text = text.replace(legacy_tag, BODY_TAG, 1)
        else:
            anchor = "{children}"
            if anchor not in text:
                raise SystemExit("layout children anchor not found")
            text = text.replace(anchor, "{children}\n        " + BODY_TAG, 1)
    LAYOUT.write_text(text, encoding="utf-8")
    print("Patched layout.tsx with CouponLaunchPopup")


def main() -> int:
    if not COMPONENT_SRC.is_file():
        raise SystemExit(f"Missing {COMPONENT_SRC} — upload component first")
    patch_layout()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
