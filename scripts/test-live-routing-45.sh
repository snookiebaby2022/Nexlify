#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "encodeURIComponent(JSON.parse(process.argv[1]).p)" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
URL="/live/${U}/${P}/${SID}.ts"
echo "=== direct 10gbs ==="
curl -sS -m 25 -o /tmp/d.bin -w "direct10gbs:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' "http://209.237.141.15:8080${URL}" || true
echo "=== via nginx localhost:8080 ==="
curl -sS -m 25 -o /tmp/n.bin -w "nginx8080:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' "http://127.0.0.1:8080${URL}" || true
wc -c /tmp/d.bin /tmp/n.bin 2>/dev/null || true
