#!/usr/bin/env bash
# Full playback diagnosis on the panel host.
# Optional env: PLAYBACK_PROBE_URL (full edge TS URL), UPSTREAM_PROBE_URLS, FFMPEG_PROBE_URL
set -euo pipefail
cd /opt/nexlify-panel

echo "=== BBC One FHD + current streams settings ==="
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  const modern = await p.panelSetting.findUnique({ where: { key: "settings.streams" } });
  const legacy = await p.panelSetting.findUnique({ where: { key: "settings:streams" } });
  console.log("settings.streams", modern ? modern.value.slice(0, 800) : "(missing)");
  console.log("settings:streams", legacy ? legacy.value : "(missing)");

  const bbc = await p.stream.findMany({
    where: { name: { contains: "BBC One FHD", mode: "insensitive" }, type: "LIVE" },
    select: { id: true, name: true, streamUrl: true, lastProbeOk: true, lastProbeError: true },
  });
  console.log("\nbbc_one_fhd", JSON.stringify(bbc, null, 2));

  const smoke = await p.line.findFirst({
    where: { username: "_smoke_test" },
    select: { id: true, username: true, maxConnections: true, allowedOutputFormats: true },
  });
  console.log("\nsmoke_line", JSON.stringify(smoke, null, 2));

  await p.$disconnect();
})();
NODE

echo ""
echo "=== services ==="
ss -tlnp | grep -E ':(80|443|8080|25461|13000|13081|1935)\s' || true
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);for(const x of j)console.log(x.name,x.pm2_env.status,x.pm2_env.pm_exec_path||"");});' 2>/dev/null || pm2 list

echo ""
echo "=== edge TS smoke (15s) ==="
if [ -z "${PLAYBACK_PROBE_URL:-}" ]; then
  echo "Skip (set PLAYBACK_PROBE_URL=http://127.0.0.1/live/user/pass/id.ts)"
else
  curl -sS -m 15 -o /tmp/edge-ts.bin -w "http=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}\n" \
    "$PLAYBACK_PROBE_URL" || true
  xxd /tmp/edge-ts.bin 2>/dev/null | head -2 || echo "no data"
fi

echo ""
echo "=== upstream direct (30s) ==="
if [ -z "${UPSTREAM_PROBE_URLS:-}" ]; then
  echo "Skip (set UPSTREAM_PROBE_URLS=\"url1 url2 ...\")"
else
  for U in $UPSTREAM_PROBE_URLS; do
    B=$(curl -sS -m 30 -A "VLC/3.0.20 LibVLC/3.0.20" "$U" 2>/dev/null | wc -c | tr -d ' ')
    echo "$B bytes  $U"
  done
fi

echo ""
echo "=== ffmpeg probe (8s) ==="
if [ -z "${FFMPEG_PROBE_URL:-}" ]; then
  echo "Skip (set FFMPEG_PROBE_URL)"
else
  timeout 8 /home/nexlify/bin/ffmpeg_bin/8.0/ffmpeg -hide_banner -loglevel warning \
    -user_agent "VLC/3.0.20 LibVLC/3.0.20" \
    -probesize 500000 -analyzeduration 500000 \
    -i "$FFMPEG_PROBE_URL" \
    -frames:v 1 -f null - 2>&1 | tail -5 || true
fi
