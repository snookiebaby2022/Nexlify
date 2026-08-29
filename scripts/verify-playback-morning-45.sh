#!/usr/bin/env bash
# Confirm apps get 200 media (not 302/502).
set +e
cd /opt/nexlify-panel
rm -f /tmp/ts.bin /tmp/h.m3u8 /tmp/ts.h /tmp/hls.h
echo "=== 302 check (must be empty) ==="
grep -n 'return 302' /etc/nginx/conf.d/nexlify-live-remote-edge.conf /etc/nginx/conf.d/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-https.conf 2>/dev/null || echo "no 302 ok"
curl -sS -m 5 -o /dev/null -w "health:%{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health
SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "encodeURIComponent(JSON.parse(process.argv[1]).p)" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
echo "=== TS ==="
curl -sS -m 12 -D /tmp/ts.h -o /tmp/ts.bin \
  -w "ts:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20 LibVLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
grep -E 'HTTP/|Location:|Content-Type:' /tmp/ts.h | head -5
head -c 2 /tmp/ts.bin | xxd
echo "=== HLS ==="
curl -sS -m 8 -D /tmp/hls.h -o /tmp/h.m3u8 \
  -w "hls:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20 LibVLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.m3u8"
grep -E 'HTTP/|Location:|Content-Type:' /tmp/hls.h | head -5
head -8 /tmp/h.m3u8
echo "=== :80 TS ==="
curl -sS -m 10 -o /tmp/ts80.bin \
  -w "ts80:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' "http://127.0.0.1/live/${U}/${P}/${SID}.ts"
head -c 2 /tmp/ts80.bin | xxd
