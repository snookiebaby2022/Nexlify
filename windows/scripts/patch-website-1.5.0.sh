#!/bin/bash
set -euo pipefail
UPDATES="/var/www/nexlify/src/lib/updates.ts"
if [ ! -f "$UPDATES" ]; then
  echo "updates.ts not found at $UPDATES"
  exit 1
fi
if grep -q 'version: "1.5.0"' "$UPDATES"; then
  echo "1.5.0 already in updates.ts"
else
  python3 <<'PY'
from pathlib import Path
path = Path("/var/www/nexlify/src/lib/updates.ts")
text = path.read_text(encoding="utf-8")
entry = '''  {
    version: "1.5.0",
    date: "2026-06-10",
    channel: "stable",
    summary:
      "XUI-style VOD import, sidebar persistence, expanded settings, and reliable background panel updates.",
    notes: [
      "Import Movies and Import Series default to M3U/URL with dual-list selection and TMDB auto-fetch.",
      "Sidebar sections stay expanded when navigating; no more collapsing the active category.",
      "Panel update polling is lighter; the Updates page no longer hangs on a full reload during background jobs.",
    ],
    changelog: [
      "Import Movies & Series: XUI-style bulk import: M3U/URL default, dual-listbox picker, auto category, direct source, TMDB auto-fetch, bouquets, preview",
      "Sidebar category persistence: expanded groups saved in session storage across navigation",
      "Sub-reseller help: descriptive guidance on groups and admin sub-reseller list",
      "Streaming settings: on-demand probesize with auto recommended value (128000 bytes)",
      "Cache & Redis: expanded TTL options, key prefix, maxmemory guidance, flush-on-update toggle",
      "TMDB settings: fallback language, import auto-fetch, cache TTL, operator notes",
      "Panel update UX: lightweight job polling API, fetch timeouts, immediate progress after start",
    ],
    fixes: [
      "Panel update no longer blocks Updates page on please-wait during background jobs",
      "Sidebar accordion no longer collapses the active category on every route change",
    ],
  },
'''
marker = "export const PANEL_RELEASES: PanelRelease[] = [\n"
if marker not in text:
    raise SystemExit("marker not found")
text = text.replace(marker, marker + entry, 1)
path.write_text(text, encoding="utf-8")
print("Patched updates.ts with v1.5.0")
PY
fi
cd /var/www/nexlify
npm run build
pm2 restart nexlify-web
echo "Website rebuild OK"
