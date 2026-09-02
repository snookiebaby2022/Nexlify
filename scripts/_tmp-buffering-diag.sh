#!/bin/bash
set -uo pipefail
cd /opt/nexlify-panel || exit 1

echo "=== LOAD ==="
uptime
echo "=== MEMORY ==="
free -h | head -2
echo "=== SOCKET SUMMARY ==="
ss -s | head -10
echo "=== PM2 ==="
pm2 list 2>/dev/null | grep -E 'nexlify|edge|NAME' | head -10
echo "=== EDGE ==="
EPID=$(pgrep -f 'iptv-edge-proxy.mjs' | head -1 || true)
echo "edge_pid=${EPID:-none}"
if [ -n "${EPID:-}" ]; then
  echo "edge_fds=$(ls /proc/$EPID/fd 2>/dev/null | wc -l)"
  echo "edge_cpu=$(ps -p $EPID -o %cpu= 2>/dev/null || true)"
fi
echo "syn_sent=$(ss -tn state syn-sent 2>/dev/null | wc -l)"
echo "established=$(ss -tn state established 2>/dev/null | wc -l)"
echo "=== NGINX LIVE PROXY ==="
grep -R "proxy_buffering\|proxy_read_timeout\|proxy_pass.*8080\|live/" /etc/nginx/sites-enabled/ 2>/dev/null | head -30
echo "=== LIVE PROBE ==="
SID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.stream.findFirst({where:{type:'LIVE',isActive:true,streamUrl:{not:''}},select:{id:true,streamUrl:true}}).then(r=>{console.log(r?.id||'');return p.\$disconnect();}).catch(()=>process.exit(0));
" 2>/dev/null | tail -1)
CREDS=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -e "console.log(JSON.parse(process.argv[1]).u)" "$CREDS" 2>/dev/null)
P=$(node -e "console.log(JSON.parse(process.argv[1]).p)" "$CREDS" 2>/dev/null)
echo "sid=$SID user=$U"
if [ -n "$SID" ] && [ -n "$U" ]; then
  URL="http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
  echo "probe_url=$URL"
  START=$(date +%s%3N)
  BYTES=$(curl -sS -m 8 -N -o /tmp/bufprobe.ts -w '%{http_code} %{size_download} %{time_starttransfer}' -A VLC "$URL" 2>/dev/null || echo FAIL)
  END=$(date +%s%3N)
  echo "curl_result=$BYTES elapsed_ms=$((END-START))"
  head -c 4 /tmp/bufprobe.ts 2>/dev/null | xxd -p || true
  wc -c /tmp/bufprobe.ts 2>/dev/null || true
fi
echo "=== PANEL HEALTH ==="
curl -sS -m 5 -o /dev/null -w 'health:%{http_code} ttfb:%{time_starttransfer}\n' http://127.0.0.1:13000/api/health || echo health=FAIL
echo "=== RECENT EDGE ERRORS ==="
tail -30 /var/log/nexlify/iptv-edge.log 2>/dev/null || tail -30 /opt/nexlify-panel/logs/iptv-edge.log 2>/dev/null || pm2 logs nexlify-iptv-edge --lines 15 --nostream 2>/dev/null | tail -15
