#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
n=$(redis-cli --scan --pattern 'conn:q:*' | wc -l | tr -d ' ')
echo "qoe_keys=$n"
if [ "$n" -gt 0 ] && [ "$n" -lt 50000 ]; then
  redis-cli --scan --pattern 'conn:q:*' | xargs -r redis-cli del >/dev/null || true
  echo "cleared $n qoe keys"
fi
pgrep -af rebuild-panel-safe | grep -v grep || echo no-rebuild
nohup env NEXLIFY_ALLOW_PROTECTED_45=1 NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 \
  bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-qoe-rebuild.log 2>&1 </dev/null &
echo REBUILD45:$!
ss -ltnp | grep ':8080 ' | head -1
pm2 describe nexlify-iptv-edge 2>/dev/null | awk '/status/{print; exit}' || true
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
