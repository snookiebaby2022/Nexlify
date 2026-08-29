#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const servers = await p.streamServer.findMany({
    select: {
      id: true,
      name: true,
      host: true,
      agentLastSeen: true,
      agentVersion: true,
      proxyId: true,
      proxy: { select: { host: true, port: true, isActive: true } },
    },
  });
  const proxies = await p.streamProxy.findMany({ select: { id: true, name: true, host: true, port: true, isActive: true } });
  console.log(JSON.stringify({ servers, proxies }, null, 2));
  await p.$disconnect();
})();
