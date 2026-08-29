#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel

echo "=== Terminate idle postgres connections ==="
sudo -u postgres psql -d nexlify -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND pid <> pg_backend_pid();"

echo "=== XUI-style: 2 panel workers, edge serves IPTV ==="
grep -q '^PANEL_INSTANCES=' .env && sed -i 's/^PANEL_INSTANCES=.*/PANEL_INSTANCES=2/' .env || echo 'PANEL_INSTANCES=2' >> .env
grep -q '^NEXLIFY_STREAMING_OPTIMIZED=' .env && sed -i 's/^NEXLIFY_STREAMING_OPTIMIZED=.*/NEXLIFY_STREAMING_OPTIMIZED=1/' .env || echo 'NEXLIFY_STREAMING_OPTIMIZED=1' >> .env

export NEXLIFY_FORCE_RESTART=1
pm2 delete nexlify 2>/dev/null || true
pm2 start ecosystem.config.cjs --only nexlify --update-env
pm2 restart nexlify-iptv-edge nexlify-hls 2>/dev/null || true
sleep 12

echo "=== Health ==="
curl -s -m 10 http://127.0.0.1:13000/api/health; echo
pm2 list | head -14

echo "=== Playback smoke ==="
node scripts/flush-stale-connections.cjs 2>/dev/null || true
CREDS=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -e "console.log(JSON.parse(process.argv[1]).u)" "$CREDS")
P=$(node -e "console.log(JSON.parse(process.argv[1]).p)" "$CREDS")
curl -s -m 30 -o /tmp/login.json -w "login=%{http_code}\n" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}"
curl -s -m 60 -o /tmp/live.json -w "live=%{http_code} bytes=%{size_download}\n" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_streams"
SID=$(node -e "try{const j=JSON.parse(require('fs').readFileSync('/tmp/live.json','utf8'));console.log(Array.isArray(j)&&j[0]?j[0].stream_id:'')}catch(e){console.log('')}")
echo "sid=$SID"
if [ -n "$SID" ]; then
  curl -s -m 25 -o /tmp/play.bin -w "play=%{http_code} bytes=%{size_download}\n" -A 'VLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
fi
echo FIX_OK
