#!/usr/bin/env python3
"""Batch-update marketing page metadata to pageSeo()."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "marketing-drop-in" / "src" / "app"
RUN_REMOTE = ROOT.parents[2] / "windows" / "scripts" / "run-remote-cmd.ps1"

VPS_FILES = [
    "requirements/page.tsx",
    "terms/page.tsx",
    "refund-policy/page.tsx",
    "login/page.tsx",
]

UPDATES = {
    "demo/page.tsx": "/demo",
    "help/page.tsx": "/help",
    "pricing/page.tsx": "/pricing",
    "features/page.tsx": "/features",
    "install/page.tsx": "/install",
    "register/page.tsx": "/register",
    "updates/page.tsx": "/updates",
    "status/page.tsx": "/status",
    "vs/xui-one/page.tsx": "/vs/xui-one",
    "compare/xtream-panel/page.tsx": "/compare/xtream-panel",
    "compare/whmcs-iptv-module/page.tsx": "/compare/whmcs-iptv-module",
    "lp/reseller-panel/page.tsx": "/lp/reseller-panel",
    "lp/reseller-panel-uk/page.tsx": "/lp/reseller-panel-uk",
    "lp/whmcs-iptv/page.tsx": "/lp/whmcs-iptv",
    "affiliates/page.tsx": "/affiliates",
    "brand/page.tsx": "/brand",
    "privacy/page.tsx": "/privacy",
    "livestream/page.tsx": "/livestream",
    "docs/whmcs/page.tsx": "/docs/whmcs",
    "admin/page.tsx": "/admin",
    "requirements/page.tsx": "/requirements",
    "terms/page.tsx": "/terms",
    "refund-policy/page.tsx": "/refund-policy",
    "login/page.tsx": "/login",
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
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout


def patch_metadata(text: str, seo_path: str) -> str:
    if f'pageSeo("{seo_path}")' in text:
        return text

    replacement = (
        f'import {{ pageSeo }} from "@/lib/seo-pages";\n\n'
        f'export const metadata = pageSeo("{seo_path}");'
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
        new_text, n = pat.subn(replacement + "\n\n", text, count=1)
        if n:
            text = new_text
            break
    else:
        raise RuntimeError("no metadata block matched")

    text = text.replace('import { pageMetadata } from "@/lib/seo";\n', "")
    text = text.replace('import { hreflangAlternates } from "@/lib/seo";\n', "")
    if 'from "@/lib/seo-pages"' not in text:
        lines = text.split("\n")
        last_import = max(i for i, line in enumerate(lines) if line.startswith("import "))
        lines.insert(last_import + 1, 'import { pageSeo } from "@/lib/seo-pages";')
        text = "\n".join(lines)
    return text


def main() -> int:
    for rel in VPS_FILES:
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(fetch_vps(rel), encoding="utf-8", newline="\n")
        print(f"copied {rel}")

    for rel, seo_path in UPDATES.items():
        path = ROOT / rel
        if not path.is_file():
            print(f"skip missing {rel}")
            continue
        try:
            path.write_text(patch_metadata(path.read_text(encoding="utf-8"), seo_path), encoding="utf-8", newline="\n")
            print(f"updated {rel}")
        except RuntimeError as e:
            print(f"FAILED {rel}: {e}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
