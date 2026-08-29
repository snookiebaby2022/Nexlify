#!/usr/bin/env node
/** Flush stale live connection rows that block max_connections slots. */
const path = require("path");
process.chdir(path.join(__dirname, ".."));

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const test = await prisma.liveConnection.deleteMany({
      where: {
        OR: [
          { ip: "1.2.3.4" },
          { ip: "1.1.1.1" },
          { ip: { startsWith: "203.0.113." } },
          { ip: { startsWith: "198.51.100." } },
          { ip: { startsWith: "192.0.2." } },
        ],
      },
    });
    console.log("removed test/probe rows:", test.count);

    const stale = await prisma.liveConnection.deleteMany({
      where: {
        lastSeenAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    console.log("removed stale rows (>15m):", stale.count);

    const active = await prisma.liveConnection.count();
    console.log("remaining active rows:", active);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
