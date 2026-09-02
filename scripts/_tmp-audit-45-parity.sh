#!/bin/bash
set +e
echo '=== host ==='
hostname -I | awk '{print $1}'
cd /opt/nexlify-panel
echo "=== git $(git log -1 --oneline) ==="
echo '=== health ==='
curl -sS -m 8 http://127.0.0.1:13000/api/health
echo
echo -n 'player_api empty: '
curl -sS -o /tmp/pa.json -w '%{http_code}' --max-time 8 -H 'Host: darkcdn.store' 'http://127.0.0.1/player_api.php'
python3 -c 'import json; j=json.load(open("/tmp/pa.json")); print(" auth", j.get("user_info",{}).get("auth"), "port", (j.get("server_info") or {}).get("port"))' 2>/dev/null || echo
echo -n 'player_api HEAD: '
curl -sSI --max-time 8 -H 'Host: darkcdn.store' 'http://127.0.0.1/player_api.php' | tr -d '\r' | awk 'NR==1{print}'
echo '=== 8080 ==='
ss -ltnp | awk '/:8080 /{print; exit}'
echo '=== pm2 edge ==='
pm2 describe nexlify-iptv-edge 2>/dev/null | awk '/status/{print; exit}'
echo '=== live proxy ==='
grep -n '209.237.141.15' /etc/nginx/conf.d/nexlify-live-remote-edge.conf 2>/dev/null | head -5
echo '=== live lock ==='
lsattr /etc/nginx/conf.d/nexlify-live-remote-edge.conf /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs 2>/dev/null | head -5
echo '=== qoe in running src ==='
grep -n 'MIN_HEALTHY_PULSE_BYTES\|STALL_GAP_MS\|xtreamUnauthPayload\|userAgentIsSmartTv' src/lib/connection-quality-live.ts src/app/player_api.php/route.ts src/lib/live-http-range.ts scripts/iptv-edge-proxy.mjs 2>/dev/null | head -20
echo '=== hashes ==='
for f in \
  package.json \
  src/app/player_api.php/route.ts \
  src/app/panel_api.php/route.ts \
  src/lib/xtream.ts \
  src/lib/xtream-unauth.ts \
  src/lib/line-restrictions.ts \
  src/lib/stream-playback-policy.ts \
  src/lib/live-http-range.ts \
  src/lib/client-playback-profiles.ts \
  src/lib/connection-map-geo.ts \
  src/lib/connection-quality-live.ts \
  src/lib/connection-quality.ts \
  src/app/api/internal/live-auth/route.ts \
  src/app/api/admin/streams/route.ts \
  src/app/api/admin/streams/mass/route.ts \
  src/app/api/admin/connection-map/route.ts \
  src/components/streams-list.tsx \
  src/components/connection-map.tsx \
  scripts/iptv-edge-proxy.mjs \
  scripts/full-audit-smoke.sh \
  scripts/edge-proxy-parity.test.mjs
 do
  if [ -f "$f" ]; then md5sum "$f"
  else echo "MISSING $f"
  fi
done
echo '=== git status product ==='
git status --short | grep -vE '_tmp-|^\?\? scripts/_' | head -40
echo AUDIT_OK
