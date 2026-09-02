#!/usr/bin/env node
"use strict";
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.stream.findMany({
    where: {
      type: "LIVE",
      isActive: true,
      OR: [
        { name: { equals: "ITV 1 HD", mode: "insensitive" } },
        { name: { equals: "ITV HD", mode: "insensitive" } },
        { name: { contains: "ITV 1 FHD", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, isOnDemand: true, vodMode: true, category: { select: { name: true } }, streamUrl: true },
    take: 30,
  });
  const host = (u) => { try { return new URL(u).host; } catch { return ""; } };
  console.log(JSON.stringify(rows.map((s) => ({ name: s.name, cat: s.category?.name, onDemand: s.isOnDemand, vodMode: s.vodMode, host: host(s.streamUrl) })), null, 2));
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => { console.error(e); process.exit(1); });
