#!/usr/bin/env bash
# Playback smoke via IPTV edge (:80) and panel upstream (:13000).
set -euo pipefail
cd /opt/nexlify-panel
node scripts/ensure-smoke-test-line.cjs >/dev/null
CREDS=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
USER=$(node -e "console.log(JSON.parse(process.argv[1]).u)" "$CREDS")
PASS=$(node -e "console.log(JSON.parse(process.argv[1]).p)" "$CREDS")
SID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.stream.findFirst({where:{type:'LIVE',isActive:true,name:{contains:'BBC',mode:'insensitive'}},select:{id:true,name:true}})
 .then(s=>{console.log(s?s.id:''); return p.\$disconnect();})
 .catch(e=>{console.error(e); process.exit(1);});
")
if [ -z "$SID" ]; then
  SID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.stream.findFirst({where:{type:'LIVE',isActive:true},select:{id:true}})
 .then(s=>{console.log(s?s.id:''); return p.\$disconnect();});
")
fi
probe() {
  local label="$1" base="$2" ext="$3"
  local url="${base}/live/${USER}/${PASS}/${SID}.${ext}"
  local code bytes ct
  code=$(curl -sS -o /tmp/smoke.out -w '%{http_code}' --max-time 15 -A 'VLC/3.0.20' -H 'X-Forwarded-For: 203.0.113.50' "$url" || echo 000)
  bytes=$(wc -c </tmp/smoke.out | tr -d ' ')
  ct=$(file -b --mime-type /tmp/smoke.out 2>/dev/null || echo unknown)
  echo "$label HTTP=$code bytes=$bytes mime=$ct"
  head -c 80 /tmp/smoke.out | tr '\n' ' '
  echo
}
echo "=== smoke line user=$USER stream=$SID ==="
probe "edge-ts" "http://127.0.0.1:80" "ts"
probe "edge-m3u8" "http://127.0.0.1:80" "m3u8"
probe "panel-ts" "http://127.0.0.1:13000" "ts"
probe "panel-m3u8" "http://127.0.0.1:13000" "m3u8"
echo "=== live-auth internal ==="
SECRET=$(grep '^PANEL_INTERNAL_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '\r"')
curl -sS -o /dev/null -w 'live-auth HTTP=%{http_code}\n' --max-time 10 \
  -H "x-panel-internal-secret: $SECRET" \
  -H "x-original-uri: /live/${USER}/${PASS}/${SID}.ts" \
  "http://127.0.0.1:13000/api/internal/live-auth"
echo "=== done ==="
