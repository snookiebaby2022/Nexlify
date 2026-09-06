#!/usr/bin/env node
/** Immediate relief: Main Server online + report nginx zombies */
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");

(async () => {
  const p = new PrismaClient();
  const before = await p.streamServer.findMany({
    select: { name: true, host: true, healthStatus: true, healthMessage: true, agentLastSeen: true },
  });
  console.log("before", JSON.stringify(before, null, 2));

  const mains = await p.streamServer.findMany({
    where: {
      OR: [{ name: { equals: "Main Server", mode: "insensitive" } }, { host: "45.88.138.18" }],
    },
    select: { id: true, name: true },
  });
  for (const m of mains) {
    await p.streamServer.update({
      where: { id: m.id },
      data: {
        healthStatus: "online",
        healthMessage: "Main server (panel)",
        lastHealthAt: new Date(),
      },
    });
    console.log("forced_online", m.name, m.id);
  }

  const zombies = execSync(
    "ps -eo pid,cmd | grep 'nginx: worker process is shutting down' | grep -v grep || true",
    { encoding: "utf8" }
  ).trim();
  console.log("zombie_nginx:\n" + (zombies || "(none)"));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
