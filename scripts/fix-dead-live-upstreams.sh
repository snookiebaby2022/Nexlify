#!/usr/bin/env bash
# Set backupUrl on live streams where primary HEAD probe fails but backup works.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LIMIT="${LIMIT:-200}"
DRY="${DRY:-0}"

node <<NODE
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const prisma = new PrismaClient();

function probe(url) {
  return new Promise((resolve) => {
    if (!url || !/^https?:\\/\\//i.test(url)) return resolve({ ok: false, code: 0 });
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, { method: "HEAD", timeout: 8000, headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, code: res.statusCode });
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, code: 0 }); });
    req.on("error", () => resolve({ ok: false, code: 0 }));
    req.end();
  });
}

(async () => {
  const rows = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true, backupUrl: { not: null } },
    select: { id: true, name: true, streamUrl: true, backupUrl: true },
    take: Number("${LIMIT}"),
  });
  let fixed = 0;
  for (const s of rows) {
    const primary = await probe(s.streamUrl);
    if (primary.ok) continue;
    const backup = await probe(s.backupUrl);
    if (!backup.ok) continue;
    console.log("SWAP", s.id.slice(0, 24), (s.name || "").slice(0, 40));
    if ("${DRY}" !== "1") {
      await prisma.stream.update({
        where: { id: s.id },
        data: { streamUrl: s.backupUrl, backupUrl: s.streamUrl },
      });
      fixed++;
    }
  }
  console.log("[fix-dead-upstreams] fixed=" + fixed + " dry=${DRY}");
  await prisma.\$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE
