#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
if pgrep -af 'rebuild-panel-safe' | grep -v "bash -c" | grep -v grep >/dev/null; then
  echo "rebuild already running"
  pgrep -af rebuild-panel-safe || true
  exit 1
fi
export NEXLIFY_ALLOW_PROTECTED_45=1
export NEXLIFY_SKIP_GIT_RESET=1
export NEXLIFY_FORCE_BUILD=1
export NEXLIFY_FORCE_RESTART=1
: > /tmp/nexlify-live-label-rebuild.log
nohup env NEXLIFY_ALLOW_PROTECTED_45=1 NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-live-label-rebuild.log 2>&1 </dev/null &
sleep 1
echo REBUILD_STARTED
head -6 /tmp/nexlify-live-label-rebuild.log
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
ss -lntp | grep ':8080 ' | head -1
