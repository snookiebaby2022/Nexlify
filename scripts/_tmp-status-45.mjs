import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const conns = await p.liveConnection.count({
    where: { lastSeenAt: { gte: new Date(Date.now() - 120_000) } },
  });
  console.log(JSON.stringify({ live_conns: conns }));
} finally {
  await p.$disconnect();
}
