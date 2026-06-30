#!/bin/bash
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
tmp=$(mktemp -d /tmp/nexlify-up-XXXXXX)
curl -fsSL "https://nexlify.live/downloads/nexlify-panel.tar.gz?v177" -o "$tmp/panel.tar.gz"
size=$(wc -c < "$tmp/panel.tar.gz" | tr -d " ")
test "$size" -gt 5000000
mkdir -p "$tmp/extract"
tar -xzf "$tmp/panel.tar.gz" -C "$tmp/extract"
src="$tmp/extract"
test -d "$tmp/extract/nexlify-panel" && src="$tmp/extract/nexlify-panel"
rsync -a --delete \
  --exclude=.env --exclude=.env.* --exclude=data/ \
  --exclude=node_modules/ --exclude=.next/ --exclude=.next.backup/ \
  "$src/" "$PANEL_DIR/"
sed -i 's/\r$//' "$PANEL_DIR"/scripts/*.sh
chmod +x "$PANEL_DIR"/scripts/*.sh
cd "$PANEL_DIR"
PANEL_CACHE_BUST=v177 bash scripts/apply-panel-fast-update.sh all
bash scripts/fix-stream-edge-now.sh 2>/dev/null || bash scripts/sync-panel-ports.sh
bash scripts/verify-panel-ports.sh || true
grep '"version"' package.json | head -1
pm2 list | head -10
echo CUSTOMER_UPDATE_OK
