#!/usr/bin/env bash
# Fix buffering: tune/restart 10gbs edge, purge RAM, fix dead upstreams, lighten panel load.
set -euo pipefail
cd /opt/nexlify-panel
export NEXLIFY_ALLOW_PROTECTED_45=1

log() { echo "[fix-buffering] $*"; }

log "=== 0/7 Unlock live routing (push edge to 10gbs) ==="
bash scripts/lock-live-routing-45.sh unlock 2>&1 | tail -3

log "=== 1/7 Push latest edge script to 10gbs ==="
node scripts/push-edge-to-10gbs.cjs 2>&1 | tail -8

log "=== 2/7 Purge XUI tmpfs + fix edge backend on 10gbs ==="
node scripts/fix-10gbs-memory-streams.cjs 2>&1 | tail -20

log "=== 3/7 Tune edge memory caps on 10gbs ==="
node scripts/tune-10gbs-edge-memory.cjs 2>&1 | tail -15

log "=== 4/7 Drop page cache on 10gbs ==="
node scripts/drop-10gbs-page-cache.cjs 2>&1 | tail -8

log "=== 5/7 Fix dead upstreams (swap to backup) ==="
LIMIT=400 bash scripts/fix-dead-live-upstreams.sh 2>&1 | tail -20

log "=== 5b Probe junki3monk3y HTML streams ==="
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const prisma = new PrismaClient();

function get(url, maxBytes = 512) {
  return new Promise((resolve) => {
    if (!url || !/^https?:\/\//i.test(url)) return resolve({ ok: false, html: false, ts: false });
    const mod = url.startsWith("http://") ? http : https;
    const req = mod.request(url, { method: "GET", timeout: 10000, headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => {
        chunks.push(c);
        if (Buffer.concat(chunks).length >= maxBytes) {
          req.destroy();
        }
      });
      res.on("end", () => finish());
      res.on("close", () => finish());
      function finish() {
        const buf = Buffer.concat(chunks);
        const ct = String(res.headers["content-type"] || "").toLowerCase();
        const html = ct.includes("html") || buf.slice(0, 32).toString("utf8", 0, 32).includes("<!");
        const ts = buf.includes(0x47);
        const m3u8 = ct.includes("mpegurl") || buf.toString("utf8", 0, 200).includes("#EXTM3U");
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, html, ts, m3u8, code: res.statusCode });
      }
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, html: false, ts: false }); });
    req.on("error", () => resolve({ ok: false, html: false, ts: false }));
    req.end();
  });
}

(async () => {
  const rows = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true, streamUrl: { contains: "junki3monk3y" } },
    select: { id: true, name: true, streamUrl: true, backupUrl: true },
    take: 120,
  });
  let disabled = 0, swapped = 0, ok = 0;
  for (const s of rows) {
    const p = await get(s.streamUrl);
    if (p.ts || p.m3u8) { ok++; continue; }
    if (s.backupUrl) {
      const b = await get(s.backupUrl);
      if (b.ts || b.m3u8) {
        await prisma.stream.update({
          where: { id: s.id },
          data: { streamUrl: s.backupUrl, backupUrl: s.streamUrl },
        });
        swapped++;
        console.log("SWAP", (s.name || s.id).slice(0, 40));
        continue;
      }
    }
    if (p.html || !p.ok) {
      await prisma.stream.update({ where: { id: s.id }, data: { isActive: false } });
      disabled++;
      console.log("DISABLE", (s.name || s.id).slice(0, 40));
    }
  }
  console.log(JSON.stringify({ sampled: rows.length, ok, swapped, disabled }));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE

log "=== 6/7 Lighten panel load (2 workers, flush DB) ==="
if grep -q '^NEXLIFY_STREAMING_OPTIMIZED=' .env 2>/dev/null; then
  sed -i 's|^NEXLIFY_STREAMING_OPTIMIZED=.*|NEXLIFY_STREAMING_OPTIMIZED=1|' .env
else
  echo 'NEXLIFY_STREAMING_OPTIMIZED=1' >> .env
fi
if grep -q '^PANEL_INSTANCES=' .env; then
  sed -i 's|^PANEL_INSTANCES=.*|PANEL_INSTANCES=2|' .env
else
  echo 'PANEL_INSTANCES=2' >> .env
fi
if grep -q '^NEXLIFY_PANEL_INSTANCES_MAX=' .env; then
  sed -i 's|^NEXLIFY_PANEL_INSTANCES_MAX=.*|NEXLIFY_PANEL_INSTANCES_MAX=2|' .env
else
  echo 'NEXLIFY_PANEL_INSTANCES_MAX=2' >> .env
fi
if grep -q '^NEXLIFY_LIVE_AUTH_CACHE_SEC=' .env; then
  sed -i 's|^NEXLIFY_LIVE_AUTH_CACHE_SEC=.*|NEXLIFY_LIVE_AUTH_CACHE_SEC=180|' .env
else
  echo 'NEXLIFY_LIVE_AUTH_CACHE_SEC=180' >> .env
fi
bash scripts/scale-panel-workers-live.sh 2>&1 || true
node scripts/flush-stale-connections.cjs 2>/dev/null || true
sudo -u postgres psql -d nexlify -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND state='idle' AND state_change < now() - interval '5 minutes' AND pid <> pg_backend_pid();" \
  2>/dev/null || true
pm2 restart nexlify --update-env 2>&1 | tail -5 || true

log "=== 7/7 Verify playback ==="
sleep 5
bash scripts/quick-playback-verify-45.sh 2>&1 | tail -25

log "=== 10gbs edge status ==="
node scripts/diag-10gbs-connectivity.cjs 2>&1 | tail -12

log "=== Re-lock live routing ==="
bash scripts/lock-live-routing-45.sh 2>&1 | tail -5

log "FIX_BUFFERING_DONE"
