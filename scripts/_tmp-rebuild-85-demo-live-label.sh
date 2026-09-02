#!/bin/bash
set -euo pipefail
pkill -f 'rebuild-panel-safe.sh' 2>/dev/null || true
pkill -f 'next/dist/bin/next build' 2>/dev/null || true
sleep 2
rm -f /tmp/nexlify-rebuild.lock
cd /home/nexlify
: > /tmp/nexlify-live-label-85-demo.log
nohup env PANEL_DIR=/home/nexlify NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 \
  bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-live-label-85-demo.log 2>&1 </dev/null &
echo REBUILD85_PID:$!
sleep 1
head -8 /tmp/nexlify-live-label-85-demo.log || true
curl -sS -o /dev/null -w '13000:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health || true
