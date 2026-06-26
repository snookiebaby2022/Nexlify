#!/usr/bin/env bash
# Package Nexlify IPTV panel for distribution (upload to nexlify.live/downloads/)
set -euo pipefail

PANEL_SRC="${PANEL_SRC:-$(cd "$(dirname "$0")/../../nexlify-panel" 2>/dev/null && pwd || echo /home/nexlify-panel)}"
OUT="${OUT:-$(dirname "$0")/../public/downloads/nexlify-panel.tar.gz}"

if [ ! -f "$PANEL_SRC/package.json" ]; then
  echo "ERROR: panel not found at $PANEL_SRC"
  echo "Set PANEL_SRC=/path/to/nexlify-panel"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
tar -czf "$OUT" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude=.env \
  --exclude='.install-credentials' \
  -C "$PANEL_SRC" .

echo "Created: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Upload to VPS: /var/www/nexlify/public/downloads/nexlify-panel.tar.gz"
echo "Or serve from https://nexlify.live/downloads/nexlify-panel.tar.gz"
