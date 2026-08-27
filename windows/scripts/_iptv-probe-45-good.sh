#!/usr/bin/env bash
set -euo pipefail
U=lucky15
P=chedpie30
B="http://127.0.0.1:8080"
SID=cmss2a8dv007jvhd6e5stpiv6

echo "=== good live $SID ==="
curl -sS -o /tmp/good.ts -w "ts HTTP %{http_code} %{size_download}B %{time_total}s\n" --max-time 12 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/${SID}.ts"
wc -c /tmp/good.ts
head -c 4 /tmp/good.ts | od -An -tx1
curl -sS -o /dev/null -w "m3u8 HTTP %{http_code} %{time_total}s\n" --max-time 8 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/${SID}.m3u8"
curl -sS -o /tmp/seg0.ts -w "seg0 HTTP %{http_code} %{size_download}B %{time_total}s\n" --max-time 12 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/${SID}/hls/seg0.ts"
head -c 4 /tmp/seg0.ts | od -An -tx1

echo "=== external darkcdn (may be CF 521) ==="
curl -sS -o /tmp/ext.ts -w "ext ts HTTP %{http_code} %{size_download}B %{time_total}s\n" --max-time 12 \
  -H "User-Agent: IPTV Smarters" "https://darkcdn.store/live/$U/$P/${SID}.ts" || true
if [ -f /tmp/ext.ts ]; then head -c 8 /tmp/ext.ts | od -An -tx1; fi

echo "=== version ==="
node -p "require('./package.json').version" 2>/dev/null || true
pm2 list | grep nexlify-iptv-edge | head -1
