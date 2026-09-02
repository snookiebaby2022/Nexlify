#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
bash scripts/lock-live-routing-45.sh unlock
node scripts/push-edge-to-10gbs.cjs
bash scripts/lock-live-routing-45.sh
# Do not start local iptv-edge; nginx owns :8080
pm2 stop nexlify-iptv-edge >/dev/null 2>&1 || true
echo '=== probe HEAD/Range/HLS as webOS ==='
UA='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager'
URL='http://127.0.0.1/live/000500000/000Leannj000/1307179470.ts'
echo -n 'HEAD: '; curl -sSI --max-time 8 -A "$UA" "$URL" | tr -d '\r' | grep -iE 'HTTP/|content-type' | head -4
echo -n 'RANGE: '; curl -sSI --max-time 8 -A "$UA" -H 'Range: bytes=0-1' "$URL" | tr -d '\r' | grep -iE 'HTTP/|content-type' | head -4
echo -n 'GET body: '; curl -sS --max-time 8 -A "$UA" "$URL" | head -12
ss -ltnp | awk '/:8080 /{print; exit}'
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
echo PUSH_AND_LOCK_OK
