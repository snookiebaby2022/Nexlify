#!/usr/bin/env python3
"""Add /features to marketing site Navbar and sitemap (run on VPS)."""
from __future__ import annotations

import sys
from pathlib import Path

NAVBAR = Path("/var/www/nexlify/src/components/Navbar.tsx")
SEO = Path("/var/www/nexlify/src/lib/seo.ts")


def patch_navbar() -> None:
    text = NAVBAR.read_text(encoding="utf-8")
    if 'href="/features"' in text:
        print("Navbar already has /features")
        return
    anchor = '<Link href="/pricing" className="hidden sm:inline hover:text-violet-300 transition-colors">'
    if anchor not in text:
        raise SystemExit("Navbar pricing link not found")
    insert = (
        '<Link href="/features" className="hidden sm:inline hover:text-violet-300 transition-colors">\n'
        "            Features\n"
        "          </Link>\n"
        "          "
    )
    text = text.replace(anchor, insert + anchor, 1)
    NAVBAR.write_text(text, encoding="utf-8")
    print("Patched Navbar.tsx")


def patch_sitemap() -> None:
    text = SEO.read_text(encoding="utf-8")
    if 'path: "/features"' in text:
        print("SITEMAP_PATHS already has /features")
        return
    anchor = '  { path: "/pricing", priority: 0.95, changeFrequency: "weekly" },'
    if anchor not in text:
        raise SystemExit("SITEMAP_PATHS pricing entry not found")
    insert = '  { path: "/features", priority: 0.8, changeFrequency: "monthly" },\n'
    text = text.replace(anchor, anchor + "\n" + insert.rstrip(), 1)
    SEO.write_text(text, encoding="utf-8")
    print("Patched seo.ts sitemap")


def main() -> int:
    patch_navbar()
    patch_sitemap()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
