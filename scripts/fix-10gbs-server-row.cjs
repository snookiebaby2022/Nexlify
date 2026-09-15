#!/usr/bin/env node
/** Reactivate 10gbs LB row so cron + admin health track playback edge. */
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const row = await p.streamServer.findFirst({ where: { name: { equals: "10gbs", mode: "insensitive" } } });
  if (!row) {
    console.error("no 10gbs server row");
    process.exit(1);
  }
  const updated = await p.streamServer.update({
    where: { id: row.id },
    data: {
      isActive: true,
      port: 8080,
      healthStatus: "online",
      healthMessage: "Primary playback edge (Xtream :8080)",
      lastHealthAt: new Date(),
    },
  });
  console.log(JSON.stringify({ id: updated.id, name: updated.name, host: updated.host, port: updated.port, isActive: updated.isActive, healthStatus: updated.healthStatus }, null, 2));
  await p.$disconnect();
})();
