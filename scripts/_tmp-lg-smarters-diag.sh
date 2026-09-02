#!/bin/bash
set -euo pipefail
echo '=== nginx live 302 check ==='
grep -nE 'return 302|proxy_pass|location.*/live' /etc/nginx/conf.d/nexlify-live-remote-edge.conf /etc/nginx/conf.d/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-https.conf 2>/dev/null | head -40
echo
echo '=== advertised env ==='
grep -E '^(NEXT_PUBLIC_SERVER_URL|PANEL_BEHIND_NGINX|NEXLIFY_USE_IPTV_EDGE|STREAM_HTTP_PORT|STREAM_EDGE_PORT|PANEL_PUBLIC_PORT|STREAM_HTTPS_PORT)=' /opt/nexlify-panel/.env | sed 's/PASSWORD=.*/PASSWORD=***/'
echo
echo '=== who owns 8080 ==='
ss -ltnp | awk '/:8080 /{print; exit}'
echo
echo '=== recent access UAs: smarters/webos/lg ==='
for f in /var/log/nginx/access.log /var/log/nginx/access.log.1 /opt/nexlify-panel/logs/access.log; do
  [ -f "$f" ] || continue
  echo "-- $f --"
  grep -iE 'smarters|web0s|webos|smart-tv|smarttv|NetCast|LG Browser|WebAppManager' "$f" | tail -30 || true
done
echo
echo '=== sample live headers (no play) ==='
curl -sSI -A 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager' \
  --max-time 8 http://127.0.0.1/player_api.php | head -20 || true
echo
echo '=== player_api formats WebOS vs Smarters (need creds from db) ==='
cd /opt/nexlify-panel
node -e '
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const uas = await p.connection.groupBy({
    by: ["userAgent"],
    _count: { _all: true },
    orderBy: { _count: { userAgent: "desc" } },
    take: 40,
  }).catch(()=>[]);
  console.log("=== top connection UAs ===");
  for (const r of uas) console.log(String(r._count._all).padStart(5), String(r.userAgent||"(empty)").slice(0,180));

  const recent = await p.connection.findMany({
    where: { OR: [
      { userAgent: { contains: "smarters", mode: "insensitive" } },
      { userAgent: { contains: "Web0S", mode: "insensitive" } },
      { userAgent: { contains: "webOS", mode: "insensitive" } },
      { userAgent: { contains: "SmartTV", mode: "insensitive" } },
      { userAgent: { contains: "LG ", mode: "insensitive" } },
    ]},
    orderBy: { startedAt: "desc" },
    take: 25,
    select: { startedAt:true, endedAt:true, userAgent:true, ip:true, bytes:true, streamId:true, lineId:true }
  }).catch(e=>{ console.log("connection query fail", e.message); return []; });
  console.log("=== recent smarters/tv connections", recent.length, "===");
  for (const r of recent) {
    console.log(JSON.stringify({t:r.startedAt, end:r.endedAt, ip:r.ip, bytes:r.bytes, ua:String(r.userAgent||"").slice(0,160)}));
  }

  const lines = await p.line.findMany({
    where: { OR: [
      { allowedUserAgents: { not: null } },
      { disallowedUserAgents: { not: null } },
    ]},
    select: { username:true, allowedUserAgents:true, disallowedUserAgents:true, isActive:true, maxConnections:true },
    take: 30,
  });
  console.log("=== lines with UA restrictions", lines.length, "===");
  for (const l of lines) console.log(JSON.stringify(l));

  const sample = await p.line.findFirst({
    where: { isActive: true, expiresAt: { gt: new Date() } },
    select: { username:true, password:true, allowedOutput:true, allowedUserAgents:true, maxConnections:true },
    orderBy: { createdAt: "desc" },
  });
  if (sample) {
    console.log("=== sample line formats ===", JSON.stringify({u:sample.username, allowedOutput:sample.allowedOutput, ua:sample.allowedUserAgents, max:sample.maxConnections}));
  }
  await p.$disconnect();
})().catch(e=>{ console.error(e); process.exit(1); });
'
