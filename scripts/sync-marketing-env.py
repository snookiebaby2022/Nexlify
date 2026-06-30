#!/usr/bin/env python3
"""Copy LICENSE_* and STRIPE_* vars from panel .env to marketing .env."""
from __future__ import annotations

import sys
from pathlib import Path

LOCAL_LICENSE_API_URL = "http://127.0.0.1:8787"

PANEL_ENV = Path("/home/nexlify-panel/.env")
MARKETING_ENV = Path("/var/www/nexlify/.env")
KEYS = (
    "JWT_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PUBLISHABLE_KEY",
    "NEXLIFY_LICENSE_API_URL",
    "LICENSE_SERVER_API_SECRET",
    "NEXLIFY_LICENSE_API_LOCAL",
)


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
            key = raw.split("=", 1)[0].strip() if "=" in raw else ""
            if key in values:
                lines.append(f"{key}={values[key]}")
                seen.add(key)
            else:
                lines.append(raw)
    for key in KEYS:
        if key in values and key not in seen:
            lines.append(f"{key}={values[key]}")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    panel = parse_env(PANEL_ENV)
    marketing = parse_env(MARKETING_ENV)
    updates = {k: panel[k] for k in KEYS if panel.get(k)}
    # Marketing site runs on the same VPS — always call the local license server.
    updates["NEXLIFY_LICENSE_API_URL"] = LOCAL_LICENSE_API_URL
    if not updates:
        print("No panel env vars to sync", file=sys.stderr)
        return 0
    write_env(MARKETING_ENV, {**marketing, **updates})
    print(f"Synced {len(updates)} vars to {MARKETING_ENV}")
    for key in updates:
        print(f"  {key}=***")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
