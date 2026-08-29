#!/usr/bin/env bash
set +e
cd /opt/nexlify-panel

SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "encodeURIComponent(JSON.parse(process.argv[1]).p)" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
BASE="http://127.0.0.1:8080/live/${U}/${P}/${SID}"

rm -f /tmp/verify.ts /tmp/verify.m3u8 /tmp/verify-seg.ts
curl -sS -m 8 -o /tmp/verify.ts -A 'VLC/3.0.20' "${BASE}.ts"
echo "ts_bytes=$(wc -c < /tmp/verify.ts)"
echo -n "ts_magic="; head -c 4 /tmp/verify.ts | xxd -p
ffprobe -v quiet -show_entries format=format_name,duration \
  -of default=noprint_wrappers=1 /tmp/verify.ts 2>&1 | head -10

curl -sS -m 8 -o /tmp/verify.m3u8 -A 'VLC/3.0.20' "${BASE}.m3u8"
echo "--- playlist ---"
head -10 /tmp/verify.m3u8
SEG=$(awk '!/^#/ && NF {print; exit}' /tmp/verify.m3u8)
if [[ "$SEG" = /* ]]; then
  SEG_URL="http://127.0.0.1:8080${SEG}"
else
  SEG_URL="${BASE%/*}/${SEG}"
fi
# Prove the segment survives realistic player/network delay.
sleep 8
curl -sS -m 10 -o /tmp/verify-seg.ts -A 'VLC/3.0.20' "$SEG_URL"
echo "hls_segment_bytes=$(wc -c < /tmp/verify-seg.ts)"
ffprobe -v error -show_entries format=format_name,duration \
  -of default=noprint_wrappers=1 /tmp/verify-seg.ts 2>&1 | head -10

echo "--- panel ---"
curl -sS -m 5 -o /dev/null \
  -w 'health=%{http_code} total=%{time_total}s\n' \
  http://127.0.0.1:13000/api/health
echo "pulses_in_last_1000=$(tail -1000 /var/log/nginx/access.log | grep -c '/api/internal/connection-pulse')"
pm2 jlist | node -e '
const p=JSON.parse(require("fs").readFileSync(0,"utf8"));
console.log(p.filter(x=>x.name==="nexlify").map(x=>({
  id:x.pm_id, cpu:x.monit.cpu, rssMb:Math.round((x.monit.memory||0)/1048576),
  restarts:x.pm2_env.restart_time
})));
'
