#!/usr/bin/env node
/** Unlink egress proxy from 10gbs — edge on that host fetches direct. */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!server) throw new Error("10gbs missing");
  await p.streamServer.update({ where: { id: server.id }, data: { proxyId: null } });
  console.log(JSON.stringify({ ok: true, serverId: server.id, proxyId: null }));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
