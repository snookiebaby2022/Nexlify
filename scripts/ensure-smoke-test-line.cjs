#!/usr/bin/env node
/** Ensure an active smoke-test line exists (username: _smoke_test). */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  const username = "_smoke_test";
  const password = "SmokeTest2026!";
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  try {
    let line = await prisma.line.findUnique({ where: { username } });
    if (!line) {
      line = await prisma.line.create({
        data: { username, password, expiresAt, status: "ACTIVE", maxConnections: 2 },
      });
      console.log("created", username);
    } else {
      await prisma.line.update({
        where: { id: line.id },
        data: { password, status: "ACTIVE", expiresAt },
      });
      console.log("updated", username);
    }
    const bouquet = await prisma.bouquet.findFirst({
      where: { isActive: true },
      include: { streams: { include: { stream: true }, take: 1 } },
    });
    if (bouquet) {
      await prisma.lineBouquet.upsert({
        where: { lineId_bouquetId: { lineId: line.id, bouquetId: bouquet.id } },
        create: { lineId: line.id, bouquetId: bouquet.id },
        update: {},
      });
      const live = bouquet.streams.filter((s) => s.stream?.isActive && s.stream?.type === "LIVE").length;
      console.log("bouquet", bouquet.name, "live_streams", live);
    } else {
      console.log("no bouquet to attach");
    }
    console.log(JSON.stringify({ u: username, p: password }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
