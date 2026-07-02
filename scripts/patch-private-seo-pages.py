#!/usr/bin/env python3
"""Copy private VPS pages and apply noIndex pageSeo metadata."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "marketing-drop-in" / "src" / "app"
RUN_REMOTE = Path(__file__).resolve().parents[1] / "windows" / "scripts" / "run-remote-cmd.ps1"

JOBS = {
    "dashboard/page.tsx": "/dashboard",
    "support/page.tsx": "/support",
    "checkout/success/page.tsx": "/checkout/success",
    "order/success/page.tsx": "/order/success",
    "admin/tickets/page.tsx": "/admin/tickets",
}


def fetch_vps(rel: str) -> str:
    cmd = [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(RUN_REMOTE),
        "-Command",
        f"cat /var/www/nexlify/src/app/{rel}",
    ]
    return subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    ).stdout


def patch_metadata(text: str, seo_path: str) -> str:
    replacement = (
        f'import {{ pageSeo }} from "@/lib/seo-pages";\n\n'
        f'export const metadata = pageSeo("{seo_path}");\n\n'
    )
    patterns = [
        re.compile(
            r'import \{ pageMetadata \} from "@/lib/seo";\s*\n\s*export const metadata = pageMetadata\(\{[\s\S]*?\}\);',
            re.MULTILINE,
        ),
        re.compile(r"export const metadata = pageMetadata\(\{[\s\S]*?\}\);", re.MULTILINE),
        re.compile(r"export const metadata = \{[\s\S]*?\};\s*\n", re.MULTILINE),
    ]
    for pat in patterns:
        new_text, n = pat.subn(replacement, text, count=1)
        if n:
            text = new_text
            break
    else:
        raise RuntimeError(f"no metadata block matched for {seo_path}")

    text = text.replace('import { hreflangAlternates } from "@/lib/seo";\n', "")
    text = text.replace('import { pageMetadata } from "@/lib/seo";\n', "")
    return text


def main() -> None:
    for rel, seo_path in JOBS.items():
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(patch_metadata(fetch_vps(rel), seo_path), encoding="utf-8", newline="\n")
        print(f"patched {rel}")


if __name__ == "__main__":
    main()
