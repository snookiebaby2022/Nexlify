#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
pkill -f 'rebuild-panel-safe.sh' 2>/dev/null || true
pkill -f 'next/dist/bin/next build' 2>/dev/null || true
sleep 2
rm -f /tmp/nexlify-rebuild.lock
: > /tmp/nexlify-live-label-75.log
nohup env NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 \
  bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-live-label-75.log 2>&1 </dev/null &
echo REBUILD75_PID:$!
sleep 1
head -8 /tmp/nexlify-live-label-75.log || true
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health || true
