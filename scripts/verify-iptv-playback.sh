#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
echo "=== PM2 ==="
pm2 status 2>/dev/null | head -14
echo "=== nginx ==="
systemctl is-active nginx 2>/dev/null || echo inactive
echo "=== health ==="
curl -sS -m 10 -o /dev/null -w "panel13000:%{http_code}\n" http://127.0.0.1:13000/api/health || echo panel13000:fail
curl -sS -m 10 -o /dev/null -w "player8080:%{http_code}\n" "http://127.0.0.1:8080/player_api.php" || echo player8080:fail
echo "=== smoke line + stream ==="
SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
echo "$SMOKE"
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "encodeURIComponent(JSON.parse(process.argv[1]).p)" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
echo "=== live play (45:8080) stream=$SID ==="
curl -sS -m 25 -o /tmp/p.bin -w "code=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}s\n" -A "VLC/3.0.20 LibVLC/3.0.20" "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts" || true
wc -c /tmp/p.bin 2>/dev/null || true
echo "=== agent auth ==="
node scripts/test-agent-live-auth.cjs 2>&1 | tail -5
echo "=== 10gbs edge ==="
node scripts/test-edge-local-10gbs.cjs 2>&1 | tail -8
