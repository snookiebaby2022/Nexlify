#!/usr/bin/env bash
# Panel settings + optional upstream probes.
# Usage: PROVIDER_HOST=example.com UPSTREAM_PROBE_URLS="url1 url2" ./scripts/server-settings-probe.sh
set -euo pipefail
cd /opt/nexlify-panel
echo "=== panel settings keys ==="
PROVIDER_HOST="${PROVIDER_HOST:-}" node <<'NODE'
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  const keys = ["streams", "general", "binaries", "cache"];
  for (const k of keys) {
    const row = await p.panelSetting.findUnique({ where: { key: k } });
    if (row) console.log(k, row.value.slice(0, 500));
  }
  const host = process.env.PROVIDER_HOST;
  const where = host
    ? { streamUrl: { contains: host }, type: "LIVE" }
    : { type: "LIVE" };
  const streams = await p.stream.findMany({
    where,
    take: 15,
    select: { name: true, streamUrl: true, lastProbeOk: true },
    orderBy: { name: "asc" },
  });
  console.log("\nprovider_streams", JSON.stringify(streams, null, 2));
  await p.$disconnect();
})();
NODE

echo ""
echo "=== upstream bytes (20s) ==="
test_url() {
  local u="$1"
  local b
  b=$(curl -sS -m 20 -A "VLC/3.0.20 LibVLC/3.0.20" "$u" | wc -c | tr -d ' ')
  echo "$b bytes  $u"
}
if [ -z "${UPSTREAM_PROBE_URLS:-}" ]; then
  echo "Skip (set UPSTREAM_PROBE_URLS=\"url1 url2 ...\")"
else
  for u in $UPSTREAM_PROBE_URLS; do
    test_url "$u"
  done
fi
