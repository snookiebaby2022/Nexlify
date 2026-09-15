#!/usr/bin/env node
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  const r = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  console.log(
    JSON.stringify(
      {
        createdAt: r?.createdAt,
        updatedAt: r?.updatedAt,
        isActive: r?.isActive,
        healthStatus: r?.healthStatus,
        port: r?.port,
        domain: r?.domain,
        description: r?.description,
      },
      null,
      2
    )
  );
  await p.$disconnect();
})();
