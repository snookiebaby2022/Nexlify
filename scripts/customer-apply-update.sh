#!/usr/bin/env bash
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
tmp=$(mktemp -d /tmp/nexlify-up-XXXXXX)
curl -fsSL "https://nexlify.live/downloads/nexlify-panel.tar.gz?v=$(date +%s)" -o "$tmp/panel.tar.gz"
size=$(wc -c < "$tmp/panel.tar.gz" | tr -d ' ')
test "$size" -gt 500000
mkdir -p "$tmp/extract"
tar -xzf "$tmp/panel.tar.gz" -C "$tmp/extract"
src="$tmp/extract"
[ -d "$tmp/extract/nexlify-panel" ] && src="$tmp/extract/nexlify-panel"
rsync -a --delete \
  --exclude=.env --exclude=.env.* --exclude=data/ \
  --exclude=node_modules/ --exclude=.next/ --exclude=.next.backup/ \
  "$src/" "$PANEL_DIR/"
sed -i 's/\r$//' "$PANEL_DIR"/scripts/*.sh
chmod +x "$PANEL_DIR"/scripts/*.sh
cd "$PANEL_DIR"
PANEL_CACHE_BUST=v181 bash scripts/apply-panel-fast-update.sh all
echo CUSTOMER_UPDATE_OK
