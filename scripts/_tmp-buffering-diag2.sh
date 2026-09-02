#!/bin/bash
set -uo pipefail
cd /opt/nexlify-panel

echo "=== WHO OWNS PORTS ==="
ss -lntp | grep -E ':(80|443|8080|13000|25461)\s' || true

echo "=== NGINX CONFIG (live) ==="
grep -R "live\|8080\|proxy_buffer\|upstream\|209.237" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -40

echo "=== STREAMING SETTINGS ==="
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const row = await p.panelSetting.findUnique({ where: { key: 'group:streams' } });
  if (row) console.log(row.value.slice(0, 500));
  const modes = await p.stream.groupBy({
    by: ['playbackMode'],
    where: { type: 'LIVE', isActive: true },
    _count: true,
  });
  console.log('playback_modes', JSON.stringify(modes));
  const dead = await p.stream.count({
    where: { type: 'LIVE', isActive: true, OR: [{ streamUrl: { contains: 'junki3monk3y' } }, { streamUrl: { contains: 'xplatinmedia' } }] },
  });
  console.log('dead_provider_streams', dead);
  const liveConns = await p.liveConnection.count({ where: { endedAt: null } });
  console.log('active_live_connections', liveConns);
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
NODE

echo "=== LIVE VIA NGINX :80 ==="
CREDS=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -e "console.log(JSON.parse(process.argv[1]).u)" "$CREDS")
P=$(node -e "console.log(JSON.parse(process.argv[1]).p)" "$CREDS")
HOST=$(grep '^PANEL_PRIMARY_DOMAIN=' .env | cut -d= -f2- | tr -d '"')
SID=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.stream.findFirst({where:{type:'LIVE',isActive:true,streamUrl:{not:''}},select:{id:true}}).then(r=>{console.log(r?.id||'');return p.\$disconnect();});" 2>/dev/null | tail -1)
echo "host=$HOST sid=$SID"
if [ -n "$SID" ]; then
  curl -sS -m 10 -N -o /tmp/live80.ts -w 'http80:%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer} total=%{time_total}\n' \
    -H "Host: $HOST" -A VLC "http://127.0.0.1/live/${U}/${P}/${SID}.ts" || echo FAIL
  head -c 4 /tmp/live80.ts | xxd -p || true
  wc -c /tmp/live80.ts
fi

echo "=== LIVE VIA :8080 LOCAL ==="
if [ -n "$SID" ]; then
  curl -sS -m 10 -N -o /tmp/live8080.ts -w '8080:%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}\n' \
    -A VLC "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts" || echo FAIL
  head -c 4 /tmp/live8080.ts | xxd -p || true
  wc -c /tmp/live8080.ts
fi

echo "=== LIVE-AUTH LATENCY (5x) ==="
for i in 1 2 3 4 5; do
  curl -sS -m 5 -o /dev/null -w "auth$i:%{http_code} ttfb=%{time_starttransfer}\n" \
    -H "x-panel-internal-secret: $(grep '^PANEL_INTERNAL_SECRET=' .env | cut -d= -f2- | tr -d '"')" \
    -H "x-original-uri: /live/test/test/1.ts" \
    -H "x-forwarded-for: 1.2.3.4" \
    "http://127.0.0.1:13000/api/internal/live-auth" || echo auth$i=FAIL
done

echo "=== PLAYBACK QUALITY (24h) ==="
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const since = new Date(Date.now() - 24*3600*1000);
  const rows = await p.activityLog.findMany({
    where: { action: { in: ['playback_freeze','playback_stutter','playback_drop'] }, createdAt: { gte: since } },
    select: { action: true, meta: true },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });
  const counts = {};
  for (const r of rows) counts[r.action] = (counts[r.action]||0)+1;
  console.log('quality_events_24h', counts);
  const top = {};
  for (const r of rows.slice(0, 50)) {
    const name = r.meta?.streamName || r.meta?.streamId || '?';
    top[name] = (top[name]||0)+1;
  }
  console.log('top_streams', JSON.stringify(Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,8)));
  await p.$disconnect();
})().catch(e => console.error(e.message));
NODE

echo "=== CPU TOP ==="
ps aux --sort=-%cpu | head -12
