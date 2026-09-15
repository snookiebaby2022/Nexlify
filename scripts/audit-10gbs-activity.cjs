#!/usr/bin/env node
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const id = "cmtaklplh005hvh8doifjbekp";

  const mass = await p.activityLog.findMany({
    where: { action: { in: ["servers_mass_edit", "server_update", "server_create"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { createdAt: true, action: true, meta: true, userId: true },
  });
  console.log("=== servers_mass_edit / updates ===");
  for (const m of mass) console.log(m.createdAt.toISOString(), m.action, JSON.stringify(m.meta));

  const entity = await p.activityLog.findMany({
    where: { entityId: id },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { createdAt: true, action: true, meta: true },
  });
  console.log("\n=== activity for 10gbs id ===");
  for (const m of entity) console.log(m.createdAt.toISOString(), m.action, JSON.stringify(m.meta));

  const lbCron = await p.cronRunLog.findMany({
    where: {
      job: "lb_boot_recover",
      OR: [{ message: { contains: "down" } }, { status: "warn" }],
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  console.log("\n=== lb_boot_recover warns ===");
  for (const c of lbCron) console.log(c.createdAt.toISOString(), c.status, c.message);

  await p.$disconnect();
})();
