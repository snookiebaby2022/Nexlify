#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
curl -sS -m 5 -o /dev/null -w "health:%{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health
SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "JSON.parse(process.argv[1]).p" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
echo "stream=$SID user=$U"
curl -sS -m 35 -o /tmp/p.bin -w "mpegts:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts" || true
head -c 2 /tmp/p.bin 2>/dev/null | xxd || true
curl -sS -m 15 -o /tmp/h.m3u8 -w "hls:%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
  -A 'VLC/3.0.20' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.m3u8" || true
head -3 /tmp/h.m3u8 2>/dev/null || true
node scripts/test-auth-10gbs-to-panel.cjs 2>&1 | tail -5
pm2 jlist 2>/dev/null | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).filter(p=>p.name==='nexlify').map(p=>({id:p.pm_id,mem:Math.round((p.monit?.memory||0)/1048576)+'mb',cpu:p.monit?.cpu}))"
