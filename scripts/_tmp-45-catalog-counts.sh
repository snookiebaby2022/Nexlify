#!/bin/bash
set +e
cd /opt/nexlify-panel
node -e '
const {PrismaClient, StreamType} = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const servers = await p.streamServer.findMany({
    select: { id: true, name: true, host: true },
    orderBy: { sortOrder: "asc" },
  });
  const byType = await p.stream.groupBy({
    by: ["type", "isActive"],
    _count: true,
  });
  const byServer = await p.stream.groupBy({
    by: ["serverId", "type", "isActive"],
    _count: true,
  });
  const seriesTitles = await p.stream.groupBy({
    by: ["seriesName", "isActive"],
    where: { type: StreamType.SERIES, seriesName: { not: null } },
    _count: true,
  });
  const unassigned = await p.stream.groupBy({
    by: ["type"],
    where: { serverId: null },
    _count: true,
  });
  console.log("=== servers ===");
  for (const s of servers) console.log(JSON.stringify(s));
  console.log("=== by type/active ===");
  for (const r of byType) console.log(JSON.stringify(r));
  console.log("=== by server/type/active ===");
  for (const r of byServer) console.log(JSON.stringify(r));
  console.log("=== unassigned ===");
  for (const r of unassigned) console.log(JSON.stringify(r));
  const titlesAll = new Set();
  const titlesActive = new Set();
  for (const r of seriesTitles) {
    if (!r.seriesName) continue;
    titlesAll.add(r.seriesName);
    if (r.isActive) titlesActive.add(r.seriesName);
  }
  console.log(JSON.stringify({
    seriesTitlesAll: titlesAll.size,
    seriesTitlesActive: titlesActive.size,
    seriesNameGroups: seriesTitles.length,
  }));
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
'
