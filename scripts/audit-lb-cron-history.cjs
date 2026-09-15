#!/usr/bin/env node
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  const rows = await p.cronRunLog.findMany({
    where: { job: "lb_boot_recover" },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { createdAt: true, status: true, message: true },
  });
  const interesting = rows.filter(
    (r) =>
      /down [1-9]/.test(r.message || "") ||
      /recovered [1-9]/.test(r.message || "") ||
      r.status === "warn" ||
      r.status === "error"
  );
  console.log("interesting", interesting.length);
  for (const r of interesting.slice(0, 40)) {
    console.log(r.createdAt.toISOString(), r.status, r.message);
  }
  console.log("\noldest checked=1 samples:");
  for (const r of rows.filter((x) => (x.message || "").includes("checked 1")).slice(-5)) {
    console.log(r.createdAt.toISOString(), r.message);
  }
  await p.$disconnect();
})();
