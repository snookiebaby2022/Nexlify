#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();
  const line = await prisma.line.findUnique({
    where: { username: "_smoke_test" },
    select: { id: true },
  });
  if (!line) {
    console.log("smoke line not found");
    await prisma.$disconnect();
    return;
  }
  const deleted = await prisma.liveConnection.deleteMany({
    where: { lineId: line.id },
  });
  console.log(`cleared ${deleted.count} smoke connection row(s)`);
  await prisma.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
