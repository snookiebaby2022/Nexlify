#!/usr/bin/env node
/** Assign all active live streams to the 10gbs stream server (XUI load-balancer row). */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!server) throw new Error("10gbs not found");
  const r = await p.stream.updateMany({
    where: { type: "LIVE", isActive: true },
    data: { serverId: server.id },
  });
  const total = await p.stream.count({ where: { type: "LIVE", isActive: true, serverId: server.id } });
  console.log(JSON.stringify({ updated: r.count, on10gbs: total, serverId: server.id }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
