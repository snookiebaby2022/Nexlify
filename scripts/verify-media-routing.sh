#!/usr/bin/env bash
# Traffic routing verification — panel + media LB path (no destructive load).
set -euo pipefail
cd /opt/nexlify-panel
OUT=/tmp/routing-verify-$(date +%Y%m%d-%H%M%S)
mkdir -p "$OUT"
exec > >(tee "$OUT/summary.log") 2>&1

echo "=== ROUTING VERIFY ==="
date -u
echo "out=$OUT"

echo ""
echo "=== DNS ==="
for h in darkcdn.store bladesmedia2.darkcdn.win live.darkcdn.store 209.237.141.15; do
  echo "-- $h"
  dig +short A "$h" 2>/dev/null | head -5 || getent hosts "$h" | head -3 || true
done

echo ""
echo "=== Cloudflare / proxied headers ==="
for url in "https://darkcdn.store/" "http://bladesmedia2.darkcdn.win:8080/" "http://209.237.141.15:8080/"; do
  echo "-- $url"
  hdr=$(curl -sS -m 8 -D - -o /dev/null "$url" 2>&1 | tr -d '\r' || true)
  echo "$hdr" | grep -iE 'HTTP/|server:|cf-ray|cf-cache|x-served' | head -8 || true
  if echo "$url" | grep -q 'bladesmedia' && echo "$hdr" | grep -qi 'cf-ray'; then
    echo "FAIL: media hostname is Cloudflare-proxied — grey-cloud DNS or use direct IP origin"
  fi
  if echo "$url" | grep -q '209.237.141.15' && echo "$hdr" | grep -qi 'cf-ray'; then
    echo "FAIL: direct edge IP unexpectedly shows Cloudflare"
  elif echo "$url" | grep -q '209.237.141.15'; then
    echo "OK: direct edge has no cf-ray"
  fi
done

echo ""
echo "=== Media origin env ==="
grep NEXLIFY_MEDIA_ORIGIN .env .next/standalone/.env 2>/dev/null || true

echo ""
echo "=== player_api server_info (smoke) ==="
node scripts/ensure-smoke-test-line.cjs >/dev/null 2>&1 || true
curl -sS -m 10 'http://127.0.0.1:13000/player_api.php?username=_smoke_test&password=SmokeTest2026%21' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log(JSON.stringify({auth:j.user_info?.auth,url:j.server_info?.url,port:j.server_info?.port,proto:j.server_info?.server_protocol},null,2))})'

echo ""
echo "=== 10gbs stored NIC ==="
node scripts/check-edge-detect.cjs 2>/dev/null || node -e "
require('./scripts/load-env.cjs').loadEnv();
const {PrismaClient}=require('@prisma/client');
(async()=>{
  const p=new PrismaClient();
  const s=await p.streamServer.findFirst({where:{name:'10gbs'}});
  console.log(JSON.stringify({network:s?.panelSettings?.network,host:s?.host,domain:s?.domain},null,2));
  await p.\$disconnect();
})();
"

echo ""
echo "=== Panel :8080 vs LB live sample ==="
SMOKE=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -pe 'JSON.parse(process.argv[1]).u' "$SMOKE")
P=$(node -pe 'JSON.parse(process.argv[1]).p' "$SMOKE")
SID=cmthfbgvf008rvh5m3625mz0a
for BASE in "http://127.0.0.1:8080" "http://bladesmedia2.darkcdn.win:8080" "http://209.237.141.15:8080"; do
  curl -sS -m 12 -o /dev/null -w "${BASE}: code=%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n" \
    -A 'VLC/3.0.20' "${BASE}/live/${U}/${P}/${SID}.ts" || echo "${BASE}: fail"
done

echo ""
echo "=== Panel eth0 rate (3s) ==="
python3 - <<'PY'
import time
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith('eth0:'):
      c=line.replace(':',' ').split(); return int(c[1]),int(c[9])
  return 0,0
a=n(); time.sleep(3); b=n()
print(f"panel RX={(b[0]-a[0])*8/3/1e9:.3f} TX={(b[1]-a[1])*8/3/1e9:.3f} Gbps link={open('/sys/class/net/eth0/speed').read().strip()}")
PY

echo "DONE $OUT"
