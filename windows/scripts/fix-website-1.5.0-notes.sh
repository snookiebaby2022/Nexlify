#!/bin/bash
set -euo pipefail
python3 <<'PY'
import re
from pathlib import Path

path = Path("/var/www/nexlify/src/lib/updates.ts")
text = path.read_text(encoding="utf-8")

notes = """    notes: [
      "Import Movies and Import Series default to M3U/URL with dual-list selection and TMDB auto-fetch.",
      "Sidebar sections stay expanded when navigating; no more collapsing the active category.",
      "Panel update polling is lighter; the Updates page no longer hangs on a full reload during background jobs.",
    ],"""

changelog = """    changelog: [
      "Import Movies & Series: XUI-style bulk import: M3U/URL default, dual-listbox picker, auto category, direct source, TMDB auto-fetch, bouquets, preview",
      "Sidebar category persistence: expanded groups saved in session storage across navigation",
      "Sub-reseller help: descriptive guidance on groups and admin sub-reseller list",
      "Streaming settings: on-demand probesize with auto recommended value (128000 bytes)",
      "Cache & Redis: expanded TTL options, key prefix, maxmemory guidance, flush-on-update toggle",
      "TMDB settings: fallback language, import auto-fetch, cache TTL, operator notes",
      "Panel update UX: lightweight job polling API, fetch timeouts, immediate progress after start",
    ],"""

fixes = """    fixes: [
      "Panel update no longer blocks Updates page on please-wait during background jobs",
      "Sidebar accordion no longer collapses the active category on every route change",
    ],"""

pattern = re.compile(
    r'(version: "1\.5\.0",.*?channel: "stable",.*?\n)(.*?)(\n  \},\n  \{\n    version: "1\.4\.0")',
    re.DOTALL,
)
match = pattern.search(text)
if not match:
    raise SystemExit("v1.5.0 block not found in updates.ts")

replacement = (
    match.group(1)
    + "    summary:\n"
    + '      "XUI-style VOD import, sidebar persistence, expanded settings, and reliable background panel updates.",\n'
    + notes
    + "\n"
    + changelog
    + "\n"
    + fixes
    + match.group(3)
)
text = text[: match.start()] + replacement + text[match.end() :]
path.write_text(text, encoding="utf-8")
print("Replaced v1.5.0 release notes in updates.ts")
PY
cd /var/www/nexlify
npm run build
pm2 restart nexlify-web --update-env
echo "Website rebuild OK"
