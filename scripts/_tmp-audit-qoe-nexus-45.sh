#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel

echo "=== REDIS QoE (nexlify: prefix) ==="
KEYS=$(redis-cli --scan --pattern 'nexlify:conn:q:*' 2>/dev/null | wc -l)
echo "key_count=$KEYS"
redis-cli --scan --pattern 'nexlify:conn:q:*' 2>/dev/null | head -8 | while read -r k; do
  v=$(redis-cli get "$k")
  stalls=$(echo "$v" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('stallCount',0), d.get('totalBytes',0))" 2>/dev/null || echo '? ?')
  echo "$k -> stalls_bytes=$stalls"
done

echo "=== LIVE CONNECTIONS QoE AUDIT ==="
node <<'NODE'
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const p = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
const now = Date.now();

async function getQoE(lineId, streamId, ip) {
  for (const k of ["", ip?.trim() ?? "", "*"].filter((v,i,a)=>a.indexOf(v)===i)) {
    const key = `nexlify:conn:q:${lineId}:${streamId}:${k || "*"}`;
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const w = JSON.parse(raw);
      if (w?.totalBytes > 0) return w;
    } catch {}
  }
  return null;
}

const rows = await p.liveConnection.findMany({
  where: { lastSeenAt: { gte: new Date(now - 3 * 60 * 1000) } },
  orderBy: { startedAt: "asc" },
  include: {
    line: { select: { username: true } },
    stream: { select: { name: true, vodMode: true, isOnDemand: true } },
  },
});

const out = [];
for (const c of rows) {
  const w = await getQoE(c.lineId, c.streamId, c.ip);
  const up = Math.max(0, Math.floor(((now - new Date(c.startedAt).getTime()) / 1000)));
  out.push({
    stream: c.stream?.name,
    line: c.line.username,
    uptimeMin: Math.round(up / 60),
    stalls: w?.stallCount ?? 0,
    totalMb: w ? (w.totalBytes / 1048576).toFixed(1) : "0",
    hasQoE: Boolean(w),
    mode: c.stream?.vodMode === "LIVE" ? "LIVE" : c.stream?.isOnDemand ? "ON-DEMAND" : c.stream?.vodMode,
  });
}
out.sort((a,b)=>b.stalls-a.stalls || b.uptimeMin-a.uptimeMin);
console.log("total", out.length, "with_qoe_samples", out.filter(x=>x.hasQoE).length);
console.log("high_stalls", JSON.stringify(out.filter(x=>x.stalls>=3), null, 0));
console.log("mismatch_10m_5stalls", JSON.stringify(out.filter(x=>x.uptimeMin>=10 && x.stalls>=5), null, 0));
console.log("top15", JSON.stringify(out.slice(0,15), null, 0));
await p.$disconnect();
redis.disconnect();
NODE

echo "=== Find lines returning 0 live categories ==="
node <<'NODE'
import { PrismaClient } from "@prisma/client";
import { activeBouquetIds } from "./src/lib/lines.ts";
import { xtreamLiveCategoriesForLine } from "./src/lib/xtream.ts";

const p = new PrismaClient();
const recent = await p.line.findMany({
  where: { status: "ACTIVE", createdAt: { gte: new Date(Date.now() - 48*3600*1000) } },
  include: { bouquets: { include: { bouquet: true } } },
  orderBy: { createdAt: "desc" },
  take: 10,
});
for (const line of recent) {
  const bq = activeBouquetIds(line).length;
  let cats = -1;
  try {
    cats = bq ? (await xtreamLiveCategoriesForLine(line)).length : 0;
  } catch (e) {
    cats = -2;
  }
  console.log(JSON.stringify({ user: line.username, bouquets: bq, liveCategories: cats }));
}
await p.$disconnect();
NODE

echo "=== External player_api from last hour (non-XCIPTV) ==="
grep 'player_api.php' /var/log/nginx/access.log 2>/dev/null | grep -v 'XCIPTV\|127.0.0.1\|209.237' | tail -25 || true
