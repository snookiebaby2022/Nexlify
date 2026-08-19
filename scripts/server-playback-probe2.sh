#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
SECRET=$(grep -E '^PANEL_INTERNAL_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '\r"')

echo "=== upstream GET bytes ==="
UP="https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/1"
for UA in "VLC/3.0.20 LibVLC/3.0.20" "Mozilla/5.0" "XCIPTV/5.0.0"; do
  BYTES=$(curl -sS -m 15 -A "$UA" "$UP" | wc -c | tr -d ' ')
  echo "ua=$UA bytes=$BYTES"
done

echo ""
echo "=== live-auth TS ==="
curl -sS -m 12 \
  -H "PANEL_INTERNAL_SECRET: $SECRET" \
  -H "x-original-uri: /live/_smoke_test/SmokeTest2026!/1860155862.ts" \
  -H "x-original-method: GET" \
  -D /tmp/auth.hdr -o /dev/null http://127.0.0.1:13000/api/internal/live-auth
grep -i 'x-nexlify' /tmp/auth.hdr || true

echo ""
echo "=== edge HLS playlist ==="
curl -sS -m 12 -A "XCIPTV/5.0.0" "http://127.0.0.1/live/_smoke_test/SmokeTest2026!/1860155862.m3u8" | head -20

echo ""
echo "=== edge TS first bytes ==="
curl -sS -m 20 -A "XCIPTV/5.0.0" "http://127.0.0.1/live/_smoke_test/SmokeTest2026!/1860155862.ts" | head -c 8 | xxd

echo ""
echo "=== hls disk ==="
SID="cmsw4zujo00eivhee75j1406c"
ls -la "/var/lib/nexlify/hls/${SID}/" 2>/dev/null | tail -5 || echo "no hls dir"
if [ -f "/var/lib/nexlify/hls/${SID}/index.m3u8" ]; then
  tail -8 "/var/lib/nexlify/hls/${SID}/index.m3u8"
  stat -c 'mtime=%y' "/var/lib/nexlify/hls/${SID}/index.m3u8"
fi
