#!/usr/bin/env node
/** Link 10gbs stream server to its local tinyproxy egress. */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!server) throw new Error("10gbs server not found");

  let proxy = await p.streamProxy.findFirst({
    where: { host: server.host, port: 8888 },
  });
  if (!proxy) {
    proxy = await p.streamProxy.create({
      data: {
        name: "10gbs egress",
        type: "HTTP",
        host: server.host,
        port: 8888,
        isActive: true,
      },
    });
  } else if (!proxy.isActive) {
    proxy = await p.streamProxy.update({ where: { id: proxy.id }, data: { isActive: true } });
  }

  await p.streamServer.update({
    where: { id: server.id },
    data: { proxyId: proxy.id },
  });

  const linked = await p.stream.count({ where: { serverId: server.id, type: "LIVE", isActive: true } });
  console.log(JSON.stringify({ server: server.name, proxyId: proxy.id, host: proxy.host, port: proxy.port, liveStreams: linked }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
