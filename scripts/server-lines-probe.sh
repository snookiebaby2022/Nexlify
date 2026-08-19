#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
function cuidToNum(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
(async () => {
  const p = new PrismaClient();
  const s = await p.stream.findFirst({
    where: { name: { contains: "BBC One FHD", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  const numId = s ? cuidToNum(s.id) : null;
  const lines = await p.line.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    take: 8,
    orderBy: { createdAt: "desc" },
    select: {
      username: true,
      maxConnections: true,
      allowedUserAgents: true,
      disallowedUserAgents: true,
      bouquets: { select: { bouquet: { select: { name: true, streams: { where: { streamId: s?.id }, select: { streamId: true } } } } } },
    },
  });
  console.log("bbc_numeric_id", numId);
  for (const l of lines) {
    const inBouquet = l.bouquets.some((b) => b.bouquet.streams.length > 0);
    console.log(JSON.stringify({
      user: l.username,
      maxConn: l.maxConnections,
      uaAllow: l.allowedUserAgents || null,
      uaBlock: l.disallowedUserAgents || null,
      hasBbc: inBouquet,
    }));
  }
  const recent = await p.liveConnection.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: 5,
    select: { line: { select: { username: true } }, stream: { select: { name: true } }, userAgent: true, ip: true, lastSeenAt: true },
  });
  console.log("recent_connections", recent);
  await p.$disconnect();
})();
NODE
