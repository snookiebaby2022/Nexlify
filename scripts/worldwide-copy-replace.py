#!/usr/bin/env python3
"""Replace UK/USA geo copy with worldwide messaging in marketing-drop-in."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "marketing-drop-in"

# Order matters: longer / more specific phrases first.
REPLACEMENTS: list[tuple[str, str]] = [
    ("United Kingdom and United States", "worldwide"),
    ("United Kingdom, United States, and internationally", "worldwide"),
    ("United Kingdom, United States", "worldwide"),
    ("in the United Kingdom and United States", "worldwide"),
    ("for the United Kingdom and United States", "for operators worldwide"),
    ("across the UK and USA", "worldwide"),
    ("across the UK &amp; USA", "worldwide"),
    ("UK &amp; USA", "worldwide"),
    ("UK & USA", "Worldwide"),
    ("UK and USA", "worldwide"),
    ("UK / USA", "worldwide"),
    ("UK, USA, or EU regions", "any region worldwide"),
    ("UK, USA, or EU", "any region worldwide"),
    ("UK, USA, or any region", "any region worldwide"),
    ("UK or USA VPS", "VPS worldwide"),
    ("UK & USA VPS", "VPS worldwide"),
    ("UK &amp; USA VPS", "VPS worldwide"),
    ("UK & USA hosts", "hosts worldwide"),
    ("UK &amp; USA hosts", "hosts worldwide"),
    ("UK and USA hosts", "hosts worldwide"),
    ("UK & USA customers", "customers worldwide"),
    ("UK and USA customers", "customers worldwide"),
    ("UK & USA operators", "operators worldwide"),
    ("UK and USA operators", "operators worldwide"),
    ("UK &amp; USA operators", "operators worldwide"),
    ("UK & USA resellers", "resellers worldwide"),
    ("UK and USA resellers", "resellers worldwide"),
    ("UK &amp; USA resellers", "resellers worldwide"),
    ("UK & USA service providers", "service providers worldwide"),
    ("UK and USA service providers", "service providers worldwide"),
    ("UK & USA visitors", "visitors worldwide"),
    ("UK &amp; USA visitors", "visitors worldwide"),
    ("UK & USA support", "worldwide support"),
    ("UK &amp; USA support", "worldwide support"),
    ("UK & USA checkout", "Global checkout"),
    ("UK & USA pricing", "Global pricing"),
    ("UK &amp; USA pricing", "Global pricing"),
    ("UK & USA ·", "Worldwide ·"),
    ("UK &amp; USA ·", "Worldwide ·"),
    ("UK & USA.", "worldwide."),
    ("UK & USA,", "worldwide,"),
    ("UK IPTV panel", "worldwide IPTV panel"),
    ("USA IPTV panel", "worldwide IPTV panel"),
    ("— UK & USA Resellers", "— Worldwide Resellers"),
    ("— UK & USA", "— Worldwide"),
    ("| Nexlify — UK & USA", "| Nexlify"),
    ("Built for UK & USA", "Built for operators worldwide"),
    ("for UK & USA", "worldwide"),
    ("for UK and USA", "worldwide"),
    ("in the UK and USA", "worldwide"),
    ("in the UK, USA", "worldwide"),
    ("UK GDPR-conscious operators and USA hosts", "operators worldwide"),
    ("London, Manchester, New York,\n              Dallas, or any EU/US region", "any datacentre worldwide"),
    ("London, Manchester, New York, Dallas, or any EU/US region", "any datacentre worldwide"),
    ("shipping to the UK or USA", "shipping anywhere"),
    ("UK/USD checkout", "GBP/USD checkout worldwide"),
    ("UK and USA GBP/USD checkout", "GBP/USD checkout worldwide"),
    ("UK &amp; USA GBP/USD checkout", "GBP/USD checkout worldwide"),
    ("Get IPTV panel release alerts for worldwide operators", "Get IPTV panel release alerts for operators worldwide"),
    ("IPTV resellers across the worldwide choose", "IPTV resellers worldwide choose"),
    ("Trusted by operators worldwide · worldwide support", "Trusted by operators worldwide · 24/7 support"),
]

SKIP_PATH_PARTS = {
    "lp/reseller-panel-uk",
}

SKIP_PATTERNS = [
    re.compile(r"Your rights \(UK / EU / USA\)"),
    re.compile(r"cc: \"UK\""),
    re.compile(r"name: \"United Kingdom\""),
    re.compile(r"name: \"United States\""),
    re.compile(r"region: \"Manchester, UK\""),
    re.compile(r"region: \"Texas, USA\""),
    re.compile(r"UK customers checkout in GBP"),
    re.compile(r"UK visitors may withdraw"),
    re.compile(r"operators in the United Kingdom, United States"),  # privacy - fix manually
]


def should_skip_line(line: str) -> bool:
    return any(p.search(line) for p in SKIP_PATTERNS)


def transform_text(text: str, rel: str) -> str:
    if any(part in rel.replace("\\", "/") for part in SKIP_PATH_PARTS):
        return text

    lines = text.splitlines(keepends=True)
    out: list[str] = []
    for line in lines:
        if should_skip_line(line):
            out.append(line)
            continue
        new_line = line
        for old, new in REPLACEMENTS:
            new_line = new_line.replace(old, new)
        out.append(new_line)
    return "".join(out)


GRAMMAR_FIXES: list[tuple[str, str]] = [
    ("in the worldwide", "worldwide"),
    ("in the any region worldwide", "in any region worldwide"),
    ("on a any region worldwide", "on any region worldwide"),
    ("a any region worldwide", "any region worldwide"),
    ("in a any region worldwide", "in any region worldwide"),
    ("providers worldwide.", "service providers worldwide."),
    ("built for service providers in the worldwide.", "built for service providers worldwide."),
    ("built for service providers in the worldwide", "built for service providers worldwide"),
    ("management tool for service providers in the worldwide.", "management tool for service providers worldwide."),
    ("worldwide ·", "Worldwide ·"),
    ("worldwide pricing,", "Global pricing,"),
    ("worldwide GBP/USD", "GBP/USD worldwide"),
    ("for Worldwide resellers", "for resellers worldwide"),
    ("Live IPTV panel demo for Worldwide resellers", "Live IPTV panel demo for resellers worldwide"),
    ("IPTV panel features for Worldwide resellers", "IPTV panel features for resellers worldwide"),
    ("description=\"Open the full IPTV reseller panel at panel.demo.nexlify.live. worldwide operators", "description=\"Open the full IPTV reseller panel at panel.demo.nexlify.live. Operators worldwide"),
    ("Nexlify · worldwide", "Nexlify · Worldwide"),
    ("2026 comparison · worldwide", "2026 comparison · Worldwide"),
    ("WHMCS integration · worldwide", "WHMCS integration · Worldwide"),
    ("worldwide VPS deploy", "Worldwide VPS deploy"),
    ("VPS in the worldwide.", "VPS worldwide."),
    ("on the worldwide your host", "worldwide your host"),
    ("in a any region worldwide datacentre", "in any region worldwide"),
    ("primary region (worldwide)", "primary market (worldwide)"),
    ("worldwide IPTV panel", "global IPTV panel"),
    ("Trusted by operators worldwide · Worldwide support", "Trusted by operators worldwide · 24/7 support"),
]


def apply_grammar_fixes() -> int:
    changed = 0
    for path in sorted(ROOT.rglob("*")):
        if path.suffix not in {".ts", ".tsx"}:
            continue
        rel = str(path.relative_to(ROOT))
        if any(part in rel for part in SKIP_PATH_PARTS):
            continue
        text = path.read_text(encoding="utf-8")
        updated = text
        for old, new in GRAMMAR_FIXES:
            updated = updated.replace(old, new)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            print(f"grammar {rel}")
            changed += 1
    return changed


def main() -> int:
    changed = 0
    for path in sorted(ROOT.rglob("*")):
        if path.suffix not in {".ts", ".tsx", ".txt", ".md"}:
            continue
        rel = str(path.relative_to(ROOT))
        if any(part in rel for part in SKIP_PATH_PARTS):
            continue
        original = path.read_text(encoding="utf-8")
        updated = transform_text(original, rel)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            print(f"updated {rel}")
            changed += 1
    grammar = apply_grammar_fixes()
    print(f"done: {changed} files, grammar: {grammar}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
