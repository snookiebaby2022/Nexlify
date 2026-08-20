#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  const bad1 = await p.stream.count({ where: { type: "LIVE", streamUrl: { endsWith: "/1" } } });
  const bad443 = await p.stream.count({ where: { type: "LIVE", streamUrl: { contains: ":443/" } } });
  const total = await p.stream.count({ where: { type: "LIVE" } });
  const sampleBad = await p.stream.findMany({
    where: { type: "LIVE", OR: [{ streamUrl: { endsWith: "/1" } }, { streamUrl: { contains: ":443/" } }] },
    take: 8,
    select: { name: true, streamUrl: true },
  });
  console.log(JSON.stringify({ total, endsWithSlash1: bad1, hasExplicit443: bad443, sampleBad }, null, 2));
  await p.$disconnect();
})();
NODE
