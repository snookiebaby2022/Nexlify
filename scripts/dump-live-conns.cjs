#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.line
  .findUnique({ where: { username: "_smoke_test" }, select: { id: true, maxConnections: true } })
  .then(async (line) => {
    const rows = await p.liveConnection.findMany({
      where: { lineId: line.id, lastSeenAt: { gte: new Date(Date.now() - 120_000) } },
      select: { id: true, ip: true, streamId: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
    console.log(JSON.stringify({ maxConnections: line.maxConnections, rows }, null, 2));
    await p.$disconnect();
  });
