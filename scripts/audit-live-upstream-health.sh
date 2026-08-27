#!/usr/bin/env bash
# Sample live streams with dead upstream URLs (HEAD probe, 8s timeout).
# Requires panel .env DATABASE_URL or node + Prisma on panel server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LIMIT="${LIMIT:-25}"
UA="VLC/3.0.20 LibVLC/3.0.20"
TIMEOUT=8

log() { echo "[upstream-audit] $*"; }

if ! command -v node >/dev/null 2>&1 || [ ! -d node_modules/@prisma/client ]; then
  log "ERROR: run on panel server with node_modules"
  exit 1
fi

node <<NODE
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const prisma = new PrismaClient();

function probe(url) {
  return new Promise((resolve) => {
    if (!url || !/^https?:\\/\\//i.test(url)) return resolve({ ok: false, code: 0, bytes: 0 });
    let lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, { method: "HEAD", timeout: ${TIMEOUT}000, headers: { "User-Agent": "${UA}" } }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, code: res.statusCode, bytes: 0 });
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, code: 0, bytes: 0 }); });
    req.on("error", () => resolve({ ok: false, code: 0, bytes: 0 }));
    req.end();
  });
}

(async () => {
  const rows = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true },
    select: { id: true, name: true, streamUrl: true, backupUrl: true },
    take: Number("${LIMIT}"),
    orderBy: { updatedAt: "desc" },
  });
  let dead = 0;
  for (const s of rows) {
    const primary = await probe(s.streamUrl);
    const backup = s.backupUrl ? await probe(s.backupUrl) : { ok: false, code: 0 };
    const status = primary.ok ? "OK" : backup.ok ? "BACKUP_OK" : "DEAD";
    if (status === "DEAD") dead++;
    console.log(
      status.padEnd(10),
      String(s.id).slice(0, 24),
      (s.name || "").slice(0, 36),
      primary.code || "-",
      backup.code || "-"
    );
  }
  console.log("[upstream-audit] dead=" + dead + " sampled=" + rows.length);
  await prisma.\$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE
