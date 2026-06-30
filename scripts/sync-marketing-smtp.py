#!/usr/bin/env python3
"""Copy SMTP_* vars from panel .env to marketing site .env (idempotent)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

PANEL_ENV = Path("/home/nexlify-panel/.env")
MARKETING_ENV = Path("/var/www/nexlify/.env")
KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM")


def parse_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip()
    return out


def write_env(path: Path, values: dict[str, str]) -> None:
    lines: list[str] = []
    seen: set[str] = set()
    if path.is_file():
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            key_match = re.match(r"^([A-Z0-9_]+)=", raw)
            if key_match and key_match.group(1) in values:
                key = key_match.group(1)
                lines.append(f"{key}={values[key]}")
                seen.add(key)
            else:
                lines.append(raw)
    for key in KEYS:
        if key in values and key not in seen:
            lines.append(f"{key}={values[key]}")
            seen.add(key)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    panel = parse_env(PANEL_ENV)
    missing = [k for k in KEYS if k not in panel or not panel[k]]
    if missing:
        print(f"Panel env missing: {', '.join(missing)}", file=sys.stderr)
        return 1

    marketing = parse_env(MARKETING_ENV)
    updates = {k: panel[k] for k in KEYS if panel.get(k)}
    write_env(MARKETING_ENV, {**marketing, **updates})
    print(f"Synced {len(updates)} SMTP vars to {MARKETING_ENV}")
    for key in KEYS:
        if key in updates:
            print(f"  {key}=***")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
