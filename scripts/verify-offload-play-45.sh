#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
export NEXLIFY_FORCE_RESTART=1
pm2 restart nexlify --update-env >/dev/null
sleep 8
curl -sS -m 8 -o /dev/null -w "health:%{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health
SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "encodeURIComponent(JSON.parse(process.argv[1]).p)" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
echo "play $U $SID"
curl -sS -L --max-redirs 3 -m 25 -o /tmp/play.bin \
  -w "follow:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download} redirs=%{num_redirects}\n" \
  -A 'VLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts" || true
head -c 2 /tmp/play.bin | xxd || true
curl -sS -L --max-redirs 3 -m 15 -o /tmp/h.m3u8 \
  -w "hls:%{http_code} bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.m3u8" || true
head -3 /tmp/h.m3u8 || true
echo "est80=$(ss -tan state established | grep -c ':80 ' || true) est8080=$(ss -tan state established | grep -c ':8080 ' || true) est13000=$(ss -tan state established | grep -c ':13000 ' || true)"
pm2 jlist | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).filter(p=>p.name==='nexlify').map(p=>({mem:Math.round((p.monit?.memory||0)/1048576)+'mb',cpu:p.monit?.cpu}))"
