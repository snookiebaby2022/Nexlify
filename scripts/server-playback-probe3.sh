#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  const s = await p.stream.findFirst({
    where: { name: { contains: "BBC One FHD", mode: "insensitive" } },
    include: { provider: true, server: { include: { proxy: true } } },
  });
  console.log(JSON.stringify({
    streamUrl: s?.streamUrl,
    backupUrl: s?.backupUrl,
    hostedExternally: s?.hostedExternally,
    providerPath: s?.providerPath,
    provider: s?.provider,
    proxy: s?.server?.proxy,
  }, null, 2));
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE

BASE="https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/1"
for U in "$BASE" "$BASE.ts" "$BASE.m3u8"; do
  BY=$(curl -sS -m 12 -A "VLC/3.0.20 LibVLC/3.0.20" "$U" | wc -c | tr -d ' ')
  echo "bytes $BY for $U"
done

SECRET=$(grep -E '^PANEL_INTERNAL_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '\r"')
echo ""
echo "live-auth headers:"
curl -sS -m 10 \
  -H "PANEL_INTERNAL_SECRET: $SECRET" \
  -H "x-original-uri: /live/_smoke_test/SmokeTest2026!/1860155862.ts" \
  -H "x-original-method: GET" \
  http://127.0.0.1:13000/api/internal/live-auth -D - -o /dev/null | grep -iE 'HTTP/|x-nexlify'
