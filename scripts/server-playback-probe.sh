#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel

node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const s = await p.stream.findFirst({
    where: { name: { contains: "BBC One FHD", mode: "insensitive" }, type: "LIVE" },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      lastProbeOk: true,
      lastProbeError: true,
      epgChannelId: true,
      serverId: true,
    },
  });
  console.log("stream", JSON.stringify(s, null, 2));
  if (s?.epgChannelId) {
    const now = new Date();
    const progs = await p.epgProgram.findMany({
      where: { channelId: s.epgChannelId, stop: { gte: now } },
      orderBy: { start: "asc" },
      take: 4,
    });
    console.log("server_now_utc", now.toISOString());
    console.log("server_tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
    for (const pr of progs) {
      console.log(`epg ${pr.start.toISOString()} - ${pr.stop.toISOString()} | ${pr.title}`);
    }
  }
  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { username: true, password: true, maxConnections: true, id: true },
  });
  if (line && s) {
    let h = 0;
    for (let i = 0; i < s.id.length; i++) h = ((h << 5) - h + s.id.charCodeAt(i)) | 0;
    const numId = Math.abs(h);
    console.log("line", line.username, "maxConn", line.maxConnections, "numericId", numId);
    console.log("paths", {
      ts: `/live/${line.username}/${line.password}/${numId}.ts`,
      m3u8: `/live/${line.username}/${line.password}/${numId}.m3u8`,
    });
    const cons = await p.liveConnection.count({
      where: { lineId: line.id, lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
    });
    console.log("active_connections_5m", cons);
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

UP=$(node -e 'const {PrismaClient}=require("@prisma/client");new PrismaClient().stream.findFirst({where:{name:{contains:"BBC One FHD",mode:"insensitive"}},select:{streamUrl:true}}).then(s=>{console.log(s?.streamUrl||"");process.exit(0);});')
echo ""
echo "=== direct upstream ==="
if [ -n "$UP" ]; then
  echo "url=$UP"
  curl -sS -m 15 -A "VLC/3.0.20 LibVLC/3.0.20" "$UP" | head -c 4 | xxd
  curl -sS -m 8 -I -A "VLC/3.0.20 LibVLC/3.0.20" "$UP" | head -6
else
  echo "no url"
fi

PATH_TS=$(node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const s = await p.stream.findFirst({
    where: { name: { contains: "BBC One FHD", mode: "insensitive" } },
    select: { id: true },
  });
  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { username: true, password: true },
  });
  if (!s || !line) return;
  let h = 0;
  for (let i = 0; i < s.id.length; i++) h = ((h << 5) - h + s.id.charCodeAt(i)) | 0;
  console.log(`/live/${line.username}/${line.password}/${Math.abs(h)}.ts`);
  await p.$disconnect();
})();
NODE
)

echo ""
echo "=== edge port 80 ==="
if [ -n "$PATH_TS" ]; then
  echo "GET $PATH_TS"
  curl -sS -m 20 -A "XCIPTV/5.0.0 (Linux; Android 11)" "http://127.0.0.1${PATH_TS}" | head -c 4 | xxd
  curl -sS -m 8 -I -A "XCIPTV/5.0.0 (Linux; Android 11)" "http://127.0.0.1${PATH_TS}" | head -10
  M3U8="${PATH_TS%.ts}.m3u8"
  echo "HEAD $M3U8"
  curl -sS -m 8 -I -A "XCIPTV/5.0.0" "http://127.0.0.1${M3U8}" | head -10
fi

echo ""
pm2 logs nexlify-iptv-edge --lines 20 --nostream 2>/dev/null | tail -20 || true
