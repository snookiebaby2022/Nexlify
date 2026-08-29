#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel

echo "=== prisma generate ==="
npx prisma generate 2>&1 | tail -3

echo "=== flush connections ==="
node scripts/flush-stale-connections.cjs

echo "=== invalidate caches ==="
node scripts/invalidate-playback-cache.cjs

echo "=== purge duplicates ==="
node scripts/purge-stream-duplicates.cjs --all-live-url 2>&1 | tail -20

echo "=== restart services ==="
node --check scripts/iptv-edge-proxy.mjs
export NEXLIFY_FORCE_RESTART=1
bash scripts/panel-restart-safe.sh --nexlify-only 2>&1 | tail -10
pm2 restart nexlify-iptv-edge nexlify-hls --update-env
sleep 12

echo "=== verify ==="
curl -s -m 10 http://127.0.0.1:13000/api/health; echo
CREDS=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -e "console.log(JSON.parse(process.argv[1]).u)" "$CREDS")
P=$(node -e "console.log(JSON.parse(process.argv[1]).p)" "$CREDS")
curl -s -m 30 -o /tmp/login.json -w "login=%{http_code}\n" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}"
curl -s -m 90 -o /tmp/live.json -w "live=%{http_code} bytes=%{size_download}\n" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_streams"
SID=$(node -e "try{const j=JSON.parse(require('fs').readFileSync('/tmp/live.json','utf8'));console.log(Array.isArray(j)&&j[0]?j[0].stream_id:'')}catch(e){console.log('')}")
echo "sid=$SID"
if [ -n "$SID" ]; then
  curl -s -m 25 -o /tmp/play.bin -w "play=%{http_code} bytes=%{size_download}\n" -A 'VLC/3.0.20 LibVLC/3.0.20' -H 'Range: bytes=0-' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
  head -c 4 /tmp/play.bin | xxd | head -1 || true
fi
node scripts/probe-channel-playback.cjs 'BBC Two HD' 2>&1 | tail -30
echo RECOVER2_OK
