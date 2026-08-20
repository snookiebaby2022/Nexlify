#!/usr/bin/env bash
# Apply recommended playback + EPG settings on the panel server (safe merge into DB).
set -euo pipefail
cd /opt/nexlify-panel

node <<'NODE'
const { PrismaClient } = require("@prisma/client");

const STREAM_PATCH = {
  epgHoursAhead: 24,
  liveBandwidthSaver: false,
  liveInstantStart: true,
  antiFreezeEnabled: true,
  fastZapEnabled: true,
  nginxBufferLive: false,
  playbackUrlCacheTtlSec: 60,
  zapPrefetchOnLiveHit: true,
  zapPrefetchOnPlaylist: true,
  connectionTimeout: 8,
  readTimeout: 20,
  preferredLiveOutput: "ts",
};

(async () => {
  const p = new PrismaClient();
  const merge = async (key, patch) => {
    const row = await p.panelSetting.findUnique({ where: { key } });
    const current = row ? JSON.parse(row.value) : {};
    const merged = { ...current, ...patch };
    await p.panelSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(merged) },
      update: { value: JSON.stringify(merged) },
    });
    console.log("updated", key, Object.keys(patch).join(", "));
  };
  await merge("settings.streams", STREAM_PATCH);
  await merge("settings.general", { timeFormat: "24", timezone: "Europe/London" });
  await p.$disconnect();
})();
NODE

echo "=== panel settings applied ==="
