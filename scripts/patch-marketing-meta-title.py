#!/usr/bin/env python3
"""Patch homepage meta title in nexlify-web (run on VPS)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

CONFIG = Path("/tmp/marketing-meta-title.json")
FILES = [
    Path("/var/www/nexlify/src/app/page.tsx"),
    Path("/var/www/nexlify/src/app/layout.tsx"),
]


def main() -> int:
    if not CONFIG.is_file():
        print(f"Missing {CONFIG}", file=sys.stderr)
        return 1
    data = json.loads(CONFIG.read_text(encoding="utf-8-sig"))
    old = data["old"]
    new = data["new"]
    if not (45 <= len(new) <= 60):
        print(f"Title length {len(new)} outside 45-60: {new!r}", file=sys.stderr)
        return 1
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        if old not in text:
            print(f"Old title not found in {path}", file=sys.stderr)
            return 1
        path.write_text(text.replace(old, new), encoding="utf-8")
        print(f"Patched {path.name} ({len(new)} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
