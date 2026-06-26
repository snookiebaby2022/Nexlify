#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"

python3 <<'PY'
from pathlib import Path

path = Path("/home/nexlify-panel/src/components/group-edit-form.tsx")
text = path.read_text(encoding="utf-8")

old = '<tr style={{ background: "#f8fafc" }}>'
new = '<tr className="text-gray-900" style={{ background: "#f8fafc", color: "#111827" }}>'

if old not in text and new in text:
    print("group table header already fixed")
elif old in text:
    text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")
    print("group table header text set to dark on light bar")
else:
    raise SystemExit("group-edit-form thead row not found — check file changed")
PY

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env
echo "group table header contrast fix applied"
