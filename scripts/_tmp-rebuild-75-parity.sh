#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
git fetch origin main
git log -1 --oneline origin/main
export NEXLIFY_FORCE_BUILD=1
export NEXLIFY_FORCE_RESTART=1
# Pull GitHub (now matches 45) then rebuild
nohup env NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-45-parity-rebuild.log 2>&1 </dev/null &
echo REBUILD75:$!
sleep 1
head -6 /tmp/nexlify-45-parity-rebuild.log || true
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health || true
