#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
kill 2498436 2>/dev/null || true
pkill -f 'apply-panel-fast-update.sh build-compile' 2>/dev/null || true
pkill -f 'node .*next/dist/bin/next build' 2>/dev/null || true
sleep 3
if command -v fuser >/dev/null; then
  fuser -k /tmp/nexlify-rebuild.lock 2>/dev/null || true
  sleep 1
fi
rm -f /tmp/nexlify-rebuild.lock
pgrep -af 'rebuild-panel-safe|next build|apply-panel-fast' || echo 'no leftover rebuild'
git log -1 --oneline
: > /tmp/nexlify-code-sync.log
nohup env NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-code-sync.log 2>&1 </dev/null &
sleep 2
echo REBUILD_STARTED
head -10 /tmp/nexlify-code-sync.log
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
