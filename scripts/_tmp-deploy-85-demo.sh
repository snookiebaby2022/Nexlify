#!/bin/bash
set -euo pipefail
pkill -f 'rebuild-panel-safe' 2>/dev/null || true
pkill -f 'next build' 2>/dev/null || true
sleep 2
# Keep a full tree for marketing-drop-in / tarball publish
if [ -d /home/nexlify-panel/.git ]; then
  git -C /home/nexlify-panel fetch origin main
  git -C /home/nexlify-panel reset --hard origin/main || true
fi
cd /home/nexlify
git fetch origin main
git reset --hard origin/main
rm -rf whmcs-module
git log -1 --oneline
grep -m1 version package.json
: > /tmp/nexlify-demo-rebuild.log
nohup env PANEL_DIR=/home/nexlify NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-demo-rebuild.log 2>&1 </dev/null &
sleep 1
echo DEMO_REBUILD_STARTED
head -8 /tmp/nexlify-demo-rebuild.log || true
curl -sS -o /dev/null -w '13000:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
