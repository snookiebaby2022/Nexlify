#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!server) throw new Error("10gbs not found");
  const on10 = await p.stream.count({ where: { type: "LIVE", isActive: true, serverId: server.id } });
  const off10 = await p.stream.count({
    where: { type: "LIVE", isActive: true, NOT: { serverId: server.id } },
  });
  const smoke = await p.stream.findUnique({
    where: { id: "1476023810" },
    select: { id: true, serverId: true, name: true },
  });
  console.log(JSON.stringify({ serverId: server.id, on10gbs: on10, notOn10gbs: off10, smoke }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
