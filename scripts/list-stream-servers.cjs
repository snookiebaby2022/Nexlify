#!/usr/bin/env node
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  const rows = await p.streamServer.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      host: true,
      port: true,
      isActive: true,
      healthStatus: true,
      agentSshHost: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  await p.$disconnect();
})();
