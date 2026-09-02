#!/bin/bash
set -euo pipefail
# Refresh publish tree from GitHub (45 parity) then publish installer + tarball.
cd /home/nexlify-panel
git fetch origin main
git reset --hard origin/main
git log -1 --oneline
grep -n xtreamUnauthPayload src/app/player_api.php/route.ts | head -3
grep -c userAgentIsSmartTv scripts/iptv-edge-proxy.mjs
bash scripts/publish-panel-release.sh
echo PUBLISH_OK
ls -l /var/www/nexlify/public/downloads/nexlify-panel.tar.gz
# marketing audit script lives in panel repo marketing-drop-in; copy if marketing tree has scripts/
if [ -f /home/nexlify-panel/marketing-drop-in/scripts/nexlify-full-platform-audit.sh ]; then
  mkdir -p /var/www/nexlify/scripts
  cp -f /home/nexlify-panel/marketing-drop-in/scripts/nexlify-full-platform-audit.sh /var/www/nexlify/scripts/nexlify-full-platform-audit.sh || true
fi
