#!/usr/bin/env python3
"""Wire Google Tag Manager into nexlify-web layout.tsx (run on VPS)."""
from __future__ import annotations

import sys
from pathlib import Path

LAYOUT = Path("/var/www/nexlify/src/app/layout.tsx")
ENV_FILE = Path("/var/www/nexlify/.env")
GTM_ID = "GTM-KTQ4K29X"


def set_env_gtm() -> None:
    text = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.is_file() else ""
    line = f"NEXT_PUBLIC_GTM_ID={GTM_ID}"
    if "NEXT_PUBLIC_GTM_ID=" in text:
        lines = []
        for row in text.splitlines():
            if row.startswith("NEXT_PUBLIC_GTM_ID="):
                lines.append(line)
            else:
                lines.append(row)
        text = "\n".join(lines)
        if not text.endswith("\n"):
            text += "\n"
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += line + "\n"
    ENV_FILE.write_text(text, encoding="utf-8")
    print(f"Set {line} in .env")


def patch_layout() -> None:
    text = LAYOUT.read_text(encoding="utf-8")
    if "GoogleTagManagerHead" in text:
        print("layout.tsx already has Google Tag Manager")
        return

    anchor = 'import { UmamiAnalytics } from "@/components/UmamiAnalytics";'
    if anchor not in text:
        raise SystemExit("UmamiAnalytics import not found in layout.tsx")

    text = text.replace(
        anchor,
        'import { GoogleTagManagerHead, GoogleTagManagerNoscript } from "@/components/GoogleTagManager";\n'
        + anchor,
        1,
    )

    if "<body" not in text:
        raise SystemExit("<body> not found in layout.tsx")

    text = text.replace(
        "<body className=\"min-h-full flex flex-col\">",
        "<body className=\"min-h-full flex flex-col\">\n        <GoogleTagManagerNoscript />",
        1,
    )

    if "<html" not in text:
        raise SystemExit("<html> not found in layout.tsx")

    text = text.replace(
        "    >\n      <body",
        "    >\n      <GoogleTagManagerHead />\n      <body",
        1,
    )

    LAYOUT.write_text(text, encoding="utf-8")
    print("Patched layout.tsx with Google Tag Manager")


def main() -> int:
    if not LAYOUT.is_file():
        print(f"Missing {LAYOUT}", file=sys.stderr)
        return 1
    set_env_gtm()
    patch_layout()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
