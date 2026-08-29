#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel

echo "=== Terminate stale postgres connections ==="
sudo -u postgres psql -d nexlify -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND pid <> pg_backend_pid() AND state IN ('idle','idle in transaction');" || true

echo "=== XUI-style worker cap (edge serves IPTV, panel stays lean) ==="
grep -q '^PANEL_INSTANCES=' .env && sed -i 's/^PANEL_INSTANCES=.*/PANEL_INSTANCES=2/' .env || echo 'PANEL_INSTANCES=2' >> .env
grep -q '^NEXLIFY_STREAMING_OPTIMIZED=' .env && sed -i 's/^NEXLIFY_STREAMING_OPTIMIZED=.*/NEXLIFY_STREAMING_OPTIMIZED=1/' .env || echo 'NEXLIFY_STREAMING_OPTIMIZED=1' >> .env

echo "=== Repair malformed stream URLs in DB ==="
node scripts/repair-stream-source-urls.cjs

echo "=== Flush stale connection slots ==="
node scripts/flush-stale-connections.cjs

echo "=== Invalidate playback + catalog caches ==="
node scripts/invalidate-playback-cache.cjs 2>/dev/null || node scripts/bust-xtream-cache.cjs 2>/dev/null || true

echo "=== Purge duplicate live streams ==="
node scripts/purge-stream-duplicates.cjs --all-live-url

echo "=== Restart panel + edge + hls ==="
export NEXLIFY_FORCE_RESTART=1
bash scripts/panel-restart-safe.sh --nexlify-only
node --check scripts/iptv-edge-proxy.mjs
pm2 restart nexlify-iptv-edge nexlify-hls 2>/dev/null || true
sleep 12

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
  curl -s -m 25 -o /tmp/play.bin -w "play_http=%{http_code} bytes=%{size_download}\n" -A 'VLC/3.0.20 LibVLC/3.0.20' -H 'Range: bytes=0-' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
  head -c 4 /tmp/play.bin | xxd | head -1 || true
fi

echo "=== Sample channel probe (BBC Two HD) ==="
node scripts/probe-channel-playback.cjs 'BBC Two HD' 2>/dev/null | tail -20 || true

echo RECOVER_OK
