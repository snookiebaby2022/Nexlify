#!/usr/bin/env bash
# Finish buffering fix + deploy stall threshold fix (skip slow upstream probe if still running).
set -euo pipefail
cd /opt/nexlify-panel

log() { echo "[finish-fix] $*"; }

# Kill stuck upstream probe if any
pkill -f 'fix-dead-live-upstreams' 2>/dev/null || true

log "=== Quick upstream fix (limit 80) ==="
LIMIT=80 bash scripts/fix-dead-live-upstreams.sh 2>&1 | tail -10 || true

log "=== Disable junki3monk3y HTML streams (fast sample) ==="
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const prisma = new PrismaClient();
function get(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("http://") ? http : https;
    const req = mod.request(url, { method: "GET", timeout: 8000, headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => { chunks.push(c); if (Buffer.concat(chunks).length > 400) req.destroy(); });
      res.on("end", () => done());
      res.on("close", () => done());
      function done() {
        const buf = Buffer.concat(chunks);
        const ct = String(res.headers["content-type"] || "").toLowerCase();
        resolve({ ts: buf.includes(0x47), html: ct.includes("html"), m3u8: ct.includes("mpegurl") });
      }
    });
    req.on("timeout", () => { req.destroy(); resolve({ ts: false, html: false, m3u8: false }); });
    req.on("error", () => resolve({ ts: false, html: false, m3u8: false }));
    req.end();
  });
}
(async () => {
  const rows = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true, streamUrl: { contains: "junki3monk3y" } },
    select: { id: true, name: true, streamUrl: true, backupUrl: true },
    take: 60,
  });
  let disabled = 0, swapped = 0;
  for (const s of rows) {
    const p = await get(s.streamUrl);
    if (p.ts || p.m3u8) continue;
    if (s.backupUrl) {
      const b = await get(s.backupUrl);
      if (b.ts || b.m3u8) {
        await prisma.stream.update({ where: { id: s.id }, data: { streamUrl: s.backupUrl, backupUrl: s.streamUrl } });
        swapped++;
        continue;
      }
    }
    await prisma.stream.update({ where: { id: s.id }, data: { isActive: false } });
    disabled++;
  }
  console.log(JSON.stringify({ sampled: rows.length, swapped, disabled }));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE

log "=== Panel load (2 workers) ==="
grep -q '^NEXLIFY_STREAMING_OPTIMIZED=1' .env || echo 'NEXLIFY_STREAMING_OPTIMIZED=1' >> .env
sed -i 's|^PANEL_INSTANCES=.*|PANEL_INSTANCES=2|' .env 2>/dev/null || echo 'PANEL_INSTANCES=2' >> .env
sed -i 's|^NEXLIFY_PANEL_INSTANCES_MAX=.*|NEXLIFY_PANEL_INSTANCES_MAX=2|' .env 2>/dev/null || echo 'NEXLIFY_PANEL_INSTANCES_MAX=2' >> .env
bash scripts/scale-panel-workers-live.sh 2>&1 || true
node scripts/flush-stale-connections.cjs 2>/dev/null || true

log "=== Pull stall-fix + rebuild ==="
git fetch origin main
git pull --ff-only origin main
export NEXLIFY_ALLOW_PROTECTED_45=1
export NEXLIFY_FORCE_BUILD=1
nohup bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-stall-fix.log 2>&1 </dev/null &
sleep 2
echo REBUILD_STARTED

log "=== Verify playback ==="
sleep 8
bash scripts/quick-playback-verify-45.sh 2>&1 | tail -15

log "=== Re-lock routing ==="
bash scripts/lock-live-routing-45.sh 2>&1 | tail -4

log "=== 10gbs status ==="
node scripts/diag-10gbs-connectivity.cjs 2>&1 | tail -8

log "FINISH_FIX_DONE"
