#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel

echo "=== Flush stale connections ==="
node scripts/flush-stale-connections.cjs

echo "=== XUI-style worker cap (edge serves IPTV, panel stays lean) ==="
grep -q '^PANEL_INSTANCES=' .env && sed -i 's/^PANEL_INSTANCES=.*/PANEL_INSTANCES=2/' .env || echo 'PANEL_INSTANCES=2' >> .env
grep -q '^NEXLIFY_STREAMING_OPTIMIZED=' .env && sed -i 's/^NEXLIFY_STREAMING_OPTIMIZED=.*/NEXLIFY_STREAMING_OPTIMIZED=1/' .env || echo 'NEXLIFY_STREAMING_OPTIMIZED=1' >> .env

echo "=== Purge duplicate streams ==="
node scripts/purge-stream-duplicates.cjs --all-live-url

echo "=== Restart panel + edge + hls ==="
export NEXLIFY_FORCE_RESTART=1
bash scripts/panel-restart-safe.sh --nexlify-only
pm2 restart nexlify-iptv-edge nexlify-hls 2>/dev/null || true
sleep 10

echo "=== Verify ==="
curl -s -m 10 http://127.0.0.1:13000/api/health; echo
CREDS=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -e "console.log(JSON.parse(process.argv[1]).u)" "$CREDS")
P=$(node -e "console.log(JSON.parse(process.argv[1]).p)" "$CREDS")
curl -s -m 30 -o /tmp/login.json -w "login_http=%{http_code}\n" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}"
curl -s -m 90 -o /tmp/live.json -w "live_http=%{http_code} bytes=%{size_download}\n" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_streams"
SID=$(node -e "try{const j=JSON.parse(require('fs').readFileSync('/tmp/live.json','utf8'));console.log(Array.isArray(j)&&j[0]?j[0].stream_id:'')}catch(e){console.log('')}")
echo "sid=$SID"
if [ -n "$SID" ]; then
  curl -s -m 25 -o /tmp/play.bin -w "play_http=%{http_code} bytes=%{size_download}\n" -A 'VLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
  head -c 40 /tmp/play.bin | xxd | head -2
fi
echo RECOVER_OK
