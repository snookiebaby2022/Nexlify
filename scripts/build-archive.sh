#!/bin/bash
set -euo pipefail

PANEL_DIR="/opt/nexlify-panel"
DOWNLOADS="/var/www/nexlify/public/downloads"
ARCHIVE="$DOWNLOADS/nexlify-panel.tar.gz"

cd "$PANEL_DIR"

echo "=== Creating archive with source code ==="
# Remove stale build artifacts to keep archive small
rm -rf .next marketing-drop-in/.next

tar -czf "$ARCHIVE" \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='tmp_*' \
  --exclude='.pm2' \
  --exclude='marketing-drop-in/node_modules' \
  .

echo ""
echo "=== Archive stats ==="
ls -lh "$ARCHIVE"
echo "Files: $(tar -tzf "$ARCHIVE" | wc -l)"

echo ""
echo "=== Verify download URL ==="
curl -s -o /dev/null -w "HTTP %{http_code}" "https://nexlify.live/downloads/nexlify-panel.tar.gz"
echo ""

echo ""
echo "=== Update cache bust version ==="
# Update the install script cache bust
sed -i "s/PANEL_CACHE_BUST=.*/PANEL_CACHE_BUST=\"v$(date +%s)\"/" scripts/install-linux.sh
echo "New version: $(grep 'PANEL_CACHE_BUST' scripts/install-linux.sh | head -1)"
