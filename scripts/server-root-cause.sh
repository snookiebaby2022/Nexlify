#!/usr/bin/env bash
# Playback root-cause probe. Optional: UPSTREAM_PROBE_URLS, FFMPEG_PROBE_URL
set -euo pipefail
cd /opt/nexlify-panel
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  for (const g of ["streams", "general", "anti-freeze", "performance-core"]) {
    const row = await p.panelSetting.findUnique({ where: { group: g } });
    if (row) console.log("SETTING", g, JSON.stringify(row.data));
  }
  const bbc = await p.stream.findMany({
    where: { name: { contains: "BBC", mode: "insensitive" }, type: "LIVE" },
    take: 8,
    select: { name: true, streamUrl: true, lastProbeOk: true, lastProbeError: true },
  });
  console.log("bbc_streams", JSON.stringify(bbc, null, 2));
  const s = await p.stream.findFirst({
    where: { name: { contains: "BBC One FHD", mode: "insensitive" } },
    select: { streamUrl: true },
  });
  if (s?.streamUrl) {
    const u = s.streamUrl.replace(":443", "");
    console.log("test_urls", [s.streamUrl, u, u + ".ts", u.replace("https://", "http://") + ".m3u8"]);
  }
  await p.$disconnect();
})();
NODE

echo ""
echo "=== upstream byte test ==="
if [ -z "${UPSTREAM_PROBE_URLS:-}" ]; then
  echo "Skip (set UPSTREAM_PROBE_URLS=\"url1 url2 ...\")"
else
  for U in $UPSTREAM_PROBE_URLS; do
    B=$(curl -sS -m 15 -A "VLC/3.0.20" "$U" | wc -c | tr -d ' ')
    echo "$B bytes $U"
  done
fi

echo ""
echo "=== ffmpeg input check ==="
if [ -z "${FFMPEG_PROBE_URL:-}" ]; then
  echo "Skip (set FFMPEG_PROBE_URL)"
else
  timeout 5 /home/nexlify/bin/ffmpeg_bin/8.0/ffmpeg -hide_banner -loglevel error -user_agent "VLC/3.0.20" -i "$FFMPEG_PROBE_URL" -frames:v 1 -f null - 2>&1 | head -5 || true
fi
