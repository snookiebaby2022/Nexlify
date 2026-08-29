#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
sudo -u postgres psql -d nexlify -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND pid <> pg_backend_pid() AND state='idle';" 2>/dev/null | tail -3 || true
node -e 'const {PrismaClient}=require("@prisma/client"); const p=new PrismaClient(); p.stream.count({where:{type:"LIVE"}}).then(n=>console.log("live_streams",n)).finally(()=>p.$disconnect())'
# XUI remote routing: nginx owns :8080 — do not start local iptv-edge.
if [ -f /etc/nginx/conf.d/nexlify-live-remote-edge.conf ]; then
  pm2 stop nexlify-iptv-edge 2>/dev/null || true
else
  pm2 restart nexlify-iptv-edge nexlify-hls --update-env 2>/dev/null || true
fi
pm2 restart nexlify-hls --update-env 2>/dev/null || true
sleep 6
CREDS=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -e "console.log(JSON.parse(process.argv[1]).u)" "$CREDS")
P=$(node -e "console.log(JSON.parse(process.argv[1]).p)" "$CREDS")
curl -s -m 90 -o /tmp/live.json -w "live=%{http_code}\n" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_streams"
SID=$(node -e "try{const j=JSON.parse(require('fs').readFileSync('/tmp/live.json','utf8'));console.log(Array.isArray(j)&&j[0]?j[0].stream_id:'')}catch(e){console.log('')}")
echo "sid=$SID"
if [ -n "$SID" ]; then
  curl -s -m 25 -o /tmp/play.bin -w "play=%{http_code} bytes=%{size_download}\n" -A 'VLC/3.0.20 LibVLC/3.0.20' -H 'Range: bytes=0-' "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
  head -c 4 /tmp/play.bin | xxd | head -1 || true
fi
