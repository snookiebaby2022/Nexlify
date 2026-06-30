#!/usr/bin/env python3
"""Scope growth toolkit CSS to /grow routes instead of appending to globals.css."""
from __future__ import annotations

import shutil
from pathlib import Path

MARKER = "/* Nexlify growth toolkit */"
TOOLKIT = Path(__file__).resolve().parent.parent
SNIPPET = TOOLKIT / "growth-globals-snippet.css"
GROW_LAYOUT = TOOLKIT / "src" / "app" / "grow" / "layout.tsx"


def strip_growth_from_globals(globals_path: Path) -> None:
    if not globals_path.is_file():
        return
    text = globals_path.read_text(encoding="utf-8")
    if MARKER not in text:
        return
    cleaned = text.split(MARKER, 1)[0].rstrip() + "\n"
    globals_path.write_text(cleaned, encoding="utf-8")
    print(f"Removed growth CSS from {globals_path}")


def install_route_scoped_css(marketing: Path) -> None:
    grow_dir = marketing / "src" / "app" / "grow"
    grow_dir.mkdir(parents=True, exist_ok=True)

    if not SNIPPET.is_file():
        raise SystemExit(f"Missing snippet: {SNIPPET}")

    shutil.copy2(SNIPPET, grow_dir / "growth.css")
    print(f"Installed {grow_dir / 'growth.css'}")

    if GROW_LAYOUT.is_file():
        shutil.copy2(GROW_LAYOUT, grow_dir / "layout.tsx")
        print(f"Installed {grow_dir / 'layout.tsx'}")


def main() -> None:
    marketing = Path("/var/www/nexlify")
    globals_path = marketing / "src" / "app" / "globals.css"

    strip_growth_from_globals(globals_path)
    install_route_scoped_css(marketing)
    print("Growth CSS scoped to /grow layout")


if __name__ == "__main__":
    main()
