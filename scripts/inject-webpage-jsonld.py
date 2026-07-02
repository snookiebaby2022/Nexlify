#!/usr/bin/env python3
"""Inject WebPageJsonLd (+ BreadcrumbJsonLd when missing) into marketing pages."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "marketing-drop-in" / "src" / "app"

PAGES = {
    "demo/page.tsx": (
        "/demo",
        "Live IPTV panel demo for UK & USA resellers",
        "Open the full IPTV reseller panel at panel.demo.nexlify.live. UK and USA operators can explore dashboards, lines, and WHMCS-ready licensing.",
        "Demo",
    ),
    "features/page.tsx": (
        "/features",
        "IPTV panel features for UK & USA resellers",
        "Compare Nexlify IPTV management software features for UK and USA service providers — WHMCS, streaming, security, billing, and reseller tools.",
        "Features",
    ),
    "requirements/page.tsx": (
        "/requirements",
        "System requirements",
        "Plan your panel VPS and optional stream edge servers. Minimum and recommended OS and hardware for Nexlify IPTV panel deployments.",
        "Requirements",
    ),
    "terms/page.tsx": (
        "/terms",
        "Terms and conditions",
        "Terms and conditions for Nexlify products, software, websites, and services sold to UK and USA IPTV resellers.",
        "Terms",
    ),
    "refund-policy/page.tsx": (
        "/refund-policy",
        "Refund policy",
        "Refund policy for Nexlify IPTV panel license purchases. All sales final — billing disputes handled via support tickets.",
        "Refund policy",
    ),
    "register/page.tsx": (
        "/register",
        "Create your Nexlify account",
        "Register for a Nexlify IPTV reseller account and start a 7-day free trial for UK and USA operators.",
        "Register",
    ),
    "updates/page.tsx": (
        "/updates",
        "IPTV panel updates & guides",
        "Release notes, changelog, and operator guides for UK and USA IPTV resellers.",
        "Updates",
    ),
    "status/page.tsx": (
        "/status",
        "System status",
        "Nexlify marketing site, licensing API, and panel infrastructure status.",
        "Status",
    ),
    "affiliates/page.tsx": (
        "/affiliates",
        "Nexlify affiliate program",
        "Refer UK and USA IPTV resellers to Nexlify and earn commission on panel license sales.",
        "Affiliates",
    ),
    "brand/page.tsx": (
        "/brand",
        "Nexlify brand kit",
        "Download Nexlify logos, colors, and press assets for UK and USA IPTV reseller marketing.",
        "Brand",
    ),
    "privacy/page.tsx": (
        "/privacy",
        "Privacy policy",
        "How Nexlify handles personal data for UK and USA customers — cookies, analytics, billing, and privacy rights.",
        "Privacy",
    ),
    "livestream/page.tsx": (
        "/livestream",
        "Nexlify live stream",
        "Watch the Nexlify live broadcast — panel demos and product updates for UK and USA IPTV resellers.",
        "Live stream",
    ),
    "install/page.tsx": (
        "/install",
        "Install Nexlify IPTV panel",
        "One-command installer for Nexlify Xtream-compatible IPTV panel on Ubuntu or Debian VPS in the UK and USA.",
        "Install",
    ),
}


def ensure_imports(text: str) -> str:
    if 'from "@/components/WebPageJsonLd"' not in text:
        anchor = 'import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";'
        if anchor in text:
            text = text.replace(
                anchor,
                anchor + '\nimport { WebPageJsonLd } from "@/components/WebPageJsonLd";',
                1,
            )
        else:
            first = text.index("import ")
            end = text.index("\n", first)
            text = (
                text[: end + 1]
                + 'import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";\n'
                + 'import { WebPageJsonLd } from "@/components/WebPageJsonLd";\n'
                + text[end + 1 :]
            )
    return text


def snippet(seo_path: str, name: str, desc: str, crumb: str) -> str:
    return (
        "      <BreadcrumbJsonLd\n"
        "        items={[\n"
        '          { name: "Home", path: "/" },\n'
        f'          {{ name: "{crumb}", path: "{seo_path}" }},\n'
        "        ]}\n"
        "      />\n"
        f'      <WebPageJsonLd path="{seo_path}" name="{name}" description="{desc}" about="{crumb}" />\n'
    )


def inject(path_key: str, seo_path: str, name: str, desc: str, crumb: str) -> None:
    file = ROOT / path_key
    text = file.read_text(encoding="utf-8")
    if "WebPageJsonLd" in text:
        print(f"skip {path_key}")
        return

    text = ensure_imports(text)
    block = snippet(seo_path, name, desc, crumb)

    crumb_match = re.search(r"<BreadcrumbJsonLd[\s\S]*?/>", text)
    if crumb_match:
        idx = crumb_match.end()
        text = text[:idx] + "\n" + block.replace("      <BreadcrumbJsonLd\n        items={[\n          { name: \"Home\", path: \"/\" },\n          { name: \"" + crumb + "\", path: \"" + seo_path + "\" },\n        ]}\n      />\n", "") + text[idx:]
    elif "return (" in text:
        text = text.replace("return (", "return (\n    <>\n" + block, 1)
        # close fragment before final );
        text = text.replace("\n  );\n}", "\n    </>\n  );\n}", 1)
    else:
        raise RuntimeError(f"cannot inject {path_key}")

    file.write_text(text, encoding="utf-8", newline="\n")
    print(f"injected {path_key}")


def main() -> None:
    for key, args in PAGES.items():
        inject(key, *args)


if __name__ == "__main__":
    main()
