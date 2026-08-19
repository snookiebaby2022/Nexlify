#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel

try() {
  local u="$1"
  local b
  b=$(curl -sS -m 12 -A "VLC/3.0.20 LibVLC/3.0.20" "$u" | wc -c | tr -d ' ')
  local h
  h=$(curl -sS -m 8 -I -A "VLC/3.0.20" "$u" 2>/dev/null | head -1)
  echo "$b bytes | $h | $u"
}

echo "=== URL format probes ==="
try "https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/1"
try "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/1"
try "https://junki3monk3y.com/live/Blade2nd/PaaJhvNbqX/1.ts"
try "https://junki3monk3y.com:443/live/Blade2nd/PaaJhvNbqX/1.ts"
try "http://junki3monk3y.com/live/Blade2nd/PaaJhvNbqX/1.ts"

echo ""
echo "=== edge response status ==="
curl -sS -m 15 -A "XCIPTV/5.0.0" -w "\nhttp=%{http_code} type=%{content_type} bytes=%{size_download}\n" -o /dev/null "http://127.0.0.1/live/_smoke_test/SmokeTest2026!/1860155862.ts"
curl -sS -m 15 -A "XCIPTV/5.0.0" -w "\nhttp=%{http_code} type=%{content_type} bytes=%{size_download}\n" -o /dev/null "http://127.0.0.1/live/_smoke_test/SmokeTest2026!/1860155862.m3u8"

echo ""
echo "=== player_api stream row ==="
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
function cuidToNum(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
(async () => {
  const p = new PrismaClient();
  const s = await p.stream.findFirst({ where: { name: { contains: "BBC One FHD", mode: "insensitive" } }, select: { id: true, name: true } });
  console.log("id", s?.id, "numeric", s ? cuidToNum(s.id) : null);
  const lines = await p.line.findMany({ where: { status: "ACTIVE", expiresAt: { gt: new Date() } }, take: 5, select: { username: true, maxConnections: true, allowedUserAgents: true, disallowedUserAgents: true } });
  console.log("active_lines", lines);
  await p.$disconnect();
})();
NODE
