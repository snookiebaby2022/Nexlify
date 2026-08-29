#!/usr/bin/env bash
# Test playback EXACTLY as IPTV apps do: no -L, expect 200 + media bytes.
set +e
cd /opt/nexlify-panel
echo "=== nginx live locations (must NOT be 302) ==="
grep -n 'live\|return 302\|proxy_pass' /etc/nginx/conf.d/nexlify-live-remote-edge.conf /etc/nginx/conf.d/nexlify-panel-http.conf | head -40
curl -sS -m 6 -o /dev/null -w "health:%{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health
SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
echo "smoke=$SMOKE"
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "encodeURIComponent(JSON.parse(process.argv[1]).p)" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
echo "=== MPEG-TS via :8080 (no follow) ==="
curl -sS -m 18 -D /tmp/ts.h -o /tmp/ts.bin \
  -w "ts8080:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20 LibVLC/3.0.20' -H 'Range: bytes=0-' \
  "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
echo "--- headers ---"; head -12 /tmp/ts.h
echo "--- magic ---"; head -c 4 /tmp/ts.bin | xxd
echo "=== MPEG-TS via :80 (no follow) ==="
curl -sS -m 18 -D /tmp/ts80.h -o /tmp/ts80.bin \
  -w "ts80:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20 LibVLC/3.0.20' \
  "http://127.0.0.1/live/${U}/${P}/${SID}.ts"
head -8 /tmp/ts80.h; head -c 4 /tmp/ts80.bin | xxd
echo "=== HLS m3u8 via :8080 (no follow) ==="
curl -sS -m 12 -D /tmp/hls.h -o /tmp/h.m3u8 \
  -w "hls:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' \
  "http://127.0.0.1:8080/live/${U}/${P}/${SID}.m3u8"
head -10 /tmp/hls.h; head -8 /tmp/h.m3u8
echo "=== direct 10gbs ==="
curl -sS -m 15 -o /tmp/d.bin \
  -w "direct:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' \
  "http://209.237.141.15:8080/live/${U}/${P}/${SID}.ts"
head -c 4 /tmp/d.bin | xxd
node scripts/test-auth-10gbs-to-panel.cjs 2>&1 | tail -4
