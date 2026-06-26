#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"
MARKER="/* avatar-studio animations */"

echo "=== apply-avatar-studio ==="

cp "$PATCHES/animated-avatar-frame.tsx" "$PANEL/src/components/animated-avatar-frame.tsx"
cp "$PATCHES/avatar-studio.tsx" "$PANEL/src/components/avatar-studio.tsx"
cp "$PATCHES/avatar-customizer.tsx" "$PANEL/src/components/avatar-customizer.tsx"
cp "$PATCHES/admin-profile-page.tsx" "$PANEL/src/app/admin/profile/page.tsx"
cp "$PATCHES/reseller-profile-page.tsx" "$PANEL/src/app/reseller/profile/page.tsx"

python3 << PY
from pathlib import Path
css = Path("$PANEL/src/app/globals.css")
text = css.read_text()
marker = "$MARKER"
new_block = Path("$PATCHES/avatar-panel.css").read_text()
if marker in text:
    text = text[: text.index(marker)] + new_block.rstrip() + "\n"
else:
    text = text.rstrip() + "\n\n" + new_block
css.write_text(text)
print("Updated avatar animations in globals.css")
PY

cd "$PANEL"
npm run build
pm2 restart nexlify

echo "apply-avatar-studio done"
