"""Strip user-facing WHMCS copy. Skip schema columns, redirects, and 410 handlers."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SKIP_DIRS = {
    "node_modules",
    ".next",
    ".git",
    "generated",
    "whmcs-module",
    "dist",
}
SKIP_FILES = {
    "next.config.ts",
    "schema.prisma",
}
# Keep unused DB/API field names working; only rewrite prose files.
SKIP_NAME_PARTS = (
    "plans.ts",  # whmcsProductId column
    "AdminPlans.tsx",
    "route.ts",  # keep 410 copy / admin plan zod
)

REPLACEMENTS = [
    ("WHMCS IPTV module", "native billing"),
    ("WHMCS IPTV", "IPTV billing"),
    ("WHMCS billing", "Stripe billing"),
    ("WHMCS-ready", "billing-ready"),
    ("WHMCS-style", "JSON billing"),
    ("native WHMCS", "native Stripe"),
    ("via WHMCS", "via Stripe"),
    ("through WHMCS", "through Stripe"),
    ("purchase licenses through WHMCS", "purchase licenses through Stripe"),
    ("and WHMCS", ""),
    ("/ WHMCS", ""),
    ("WHMCS / ", ""),
    ("WHMCS, ", ""),
    (", WHMCS", ""),
    ("#WHMCS ", ""),
    ("#whmcs ", ""),
    ("#WHMCS", ""),
    ("#whmcs", ""),
    ("WHMCS", "billing"),
    ("whmcs iptv module", "native billing"),
    ("whmcs", "billing"),
]


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    if parts & SKIP_DIRS:
        return True
    if path.name in SKIP_FILES:
        return True
    if any(s in path.name for s in SKIP_NAME_PARTS):
        return True
    return False


def rewrite(text: str) -> str:
    out = text
    for old, new in REPLACEMENTS:
        out = out.replace(old, new)
    return out


def main() -> None:
    exts = {".ts", ".tsx", ".js", ".mjs", ".md", ".json"}
    changed = 0
    for base in (ROOT / "marketing-drop-in", ROOT / "docs"):
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in exts or should_skip(path):
                continue
            original = path.read_text(encoding="utf-8")
            updated = rewrite(original)
            if updated != original:
                path.write_text(updated, encoding="utf-8", newline="\n")
                changed += 1
                print(path.relative_to(ROOT))
    print(f"updated {changed} files")


if __name__ == "__main__":
    main()
