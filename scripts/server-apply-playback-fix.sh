#!/usr/bin/env bash
# Apply instant-play stream settings; optionally fix BBC stream URL from env.
# Usage: BBC_STREAM_URL=https://... PLAYBACK_PROBE_URL=http://127.0.0.1/live/... ./scripts/server-apply-playback-fix.sh
set -euo pipefail
cd /opt/nexlify-panel

echo "=== fix stream settings (+ optional BBC upstream) ==="
BBC_STREAM_URL="${BBC_STREAM_URL:-}" node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const OPTIMAL = {
  preferredLiveOutput: "ts",
  liveInstantStart: true,
  liveBandwidthSaver: false,
  forceUniversalMpegTs: false,
  antiFreezeEnabled: true,
  fastZapEnabled: true,
  nginxBufferLive: false,
  hlsSegmentDuration: 4,
  playbackUrlCacheTtlSec: 45,
  readTimeout: 60,
  connectionTimeout: 15,
  autoChannelLogos: true,
  autoChannelLogoSource: "tmdb_then_slug",
};
const targetUrl = process.env.BBC_STREAM_URL || "";

(async () => {
  const p = new PrismaClient();
  const row = await p.panelSetting.findUnique({ where: { key: "settings.streams" } });
  const current = row ? JSON.parse(row.value) : {};
  const merged = { ...current, ...OPTIMAL };
  await p.panelSetting.upsert({
    where: { key: "settings.streams" },
    create: { key: "settings.streams", value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });
  console.log("updated settings.streams preferredLiveOutput=", merged.preferredLiveOutput);

  if (!targetUrl) {
    console.log("BBC streamUrl unchanged (set BBC_STREAM_URL to override)");
  } else {
    const bbc = await p.stream.findFirst({
      where: { name: { contains: "BBC One FHD", mode: "insensitive" }, type: "LIVE" },
      select: { id: true, name: true, streamUrl: true },
    });
    if (!bbc) {
      console.log("BBC One FHD not found");
    } else {
      console.log("before", bbc.streamUrl);
      if (bbc.streamUrl !== targetUrl) {
        await p.stream.update({
          where: { id: bbc.id },
          data: { streamUrl: targetUrl, lastProbeOk: null, lastProbeError: null, lastProbeAt: null },
        });
        console.log("fixed streamUrl ->", targetUrl);
      } else {
        console.log("streamUrl already correct");
      }
    }
  }

  await p.$disconnect();
})();
NODE

echo ""
echo "=== restart HLS daemon (drop stale ffmpeg for BBC) ==="
pm2 restart nexlify-hls 2>/dev/null || true
sleep 2

echo ""
echo "=== edge TS after fix (20s) ==="
if [ -z "${PLAYBACK_PROBE_URL:-}" ]; then
  echo "Skip (set PLAYBACK_PROBE_URL)"
else
  curl -sS -m 20 -o /tmp/edge-ts2.bin -w "http=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}\n" \
    "$PLAYBACK_PROBE_URL" || true
  xxd /tmp/edge-ts2.bin 2>/dev/null | head -2 || echo "no data"
fi

echo ""
echo "=== upstream probe (20s) ==="
if [ -z "${UPSTREAM_PROBE_URL:-}" ]; then
  echo "Skip (set UPSTREAM_PROBE_URL)"
else
  B=$(curl -sS -m 20 -A "VLC/3.0.20 LibVLC/3.0.20" "$UPSTREAM_PROBE_URL" | wc -c | tr -d ' ')
  echo "$B bytes $UPSTREAM_PROBE_URL"
fi

echo ""
echo "=== ffmpeg probe (10s) ==="
if [ -z "${FFMPEG_PROBE_URL:-}" ]; then
  echo "Skip (set FFMPEG_PROBE_URL)"
else
  timeout 10 /home/nexlify/bin/ffmpeg_bin/8.0/ffmpeg -hide_banner -loglevel warning \
    -user_agent "VLC/3.0.20 LibVLC/3.0.20" \
    -probesize 500000 -analyzeduration 500000 \
    -i "$FFMPEG_PROBE_URL" \
    -frames:v 1 -f null - 2>&1 | tail -8 || true
fi
