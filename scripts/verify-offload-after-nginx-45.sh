#!/usr/bin/env bash
set +e
cd /opt/nexlify-panel
echo "=== restart nginx to drop old hairpin streams ==="
systemctl restart nginx
sleep 2
echo "est8080=$(ss -tan state established | grep -c ':8080 ' || true) est80=$(ss -tan state established | grep -c ':80 ' || true) est13000=$(ss -tan state established | grep -c ':13000 ' || true)"
SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "encodeURIComponent(JSON.parse(process.argv[1]).p)" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
echo "=== 302 ==="
curl -sS -m 5 -o /dev/null -D - "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts" | head -8
echo "=== follow ==="
curl -sS -L --max-redirs 3 -m 20 -o /tmp/play.bin \
  -w "follow:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download} redirs=%{num_redirects}\n" \
  -A 'VLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
head -c 2 /tmp/play.bin | xxd
echo "=== direct 10gbs ==="
curl -sS -m 20 -o /tmp/d.bin \
  -w "direct:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' "http://209.237.141.15:8080/live/${U}/${P}/${SID}.ts"
head -c 2 /tmp/d.bin | xxd
echo "=== health ==="
curl -sS -m 8 -o /dev/null -w "health:%{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health
