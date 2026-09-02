#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
export NEXLIFY_ALLOW_PROTECTED_45=1
export NEXLIFY_SKIP_GIT_RESET=1
export NEXLIFY_FORCE_BUILD=1
export NEXLIFY_FORCE_RESTART=1
bash scripts/rebuild-panel-safe.sh
pm2 stop nexlify-iptv-edge >/dev/null 2>&1 || true
ss -tlnp | grep ':8080' | head -2
curl -sS -m 5 -o /dev/null -w 'health:%{http_code}\n' http://127.0.0.1:13000/api/health || true
echo "REBUILD_DONE"
