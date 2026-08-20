#!/usr/bin/env bash
# Probe panel settings + optional upstream URLs (no credentials baked in).
# Usage: UPSTREAM_PROBE_URLS="url1 url2" ./scripts/server-bbc-upstream-probe.sh
set -euo pipefail
cd /opt/nexlify-panel
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  const all = await p.panelSetting.findMany({ select: { key: true, value: true } });
  console.log("all_panel_keys", all.map(r => r.key));
  for (const r of all) {
    if (r.key.includes("stream") || r.key.includes("setting")) {
      console.log("\n---", r.key, "---");
      try { console.log(JSON.stringify(JSON.parse(r.value), null, 2).slice(0, 2000)); } catch { console.log(r.value.slice(0, 500)); }
    }
  }
  const bbc = await p.stream.findMany({
    where: { name: { contains: "BBC One", mode: "insensitive" }, type: "LIVE" },
    select: { id: true, cuid: true, name: true, streamUrl: true, numericId: true },
    take: 10,
  });
  console.log("\nbbc_streams", JSON.stringify(bbc, null, 2));
  await p.$disconnect();
})();
NODE

echo ""
echo "=== upstream probe (30s each) ==="
probe() {
  local u="$1"
  local b ttfb
  ttfb=$(curl -sS -o /dev/null -w "%{time_starttransfer}" -m 30 -A "VLC/3.0.20 LibVLC/3.0.20" "$u" 2>/dev/null || echo "fail")
  b=$(curl -sS -m 30 -A "VLC/3.0.20 LibVLC/3.0.20" "$u" 2>/dev/null | wc -c | tr -d ' ')
  echo "bytes=$b ttfb=${ttfb}s  $u"
}
if [ -z "${UPSTREAM_PROBE_URLS:-}" ]; then
  echo "Skip (set UPSTREAM_PROBE_URLS=\"url1 url2 ...\")"
else
  for u in $UPSTREAM_PROBE_URLS; do
    probe "$u"
  done
fi
