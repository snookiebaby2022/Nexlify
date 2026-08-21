#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const conns = await p.liveConnection.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: 15,
    include: { line: { select: { username: true } }, stream: { select: { name: true } } },
  });
  const now = Date.now();
  console.log(
    JSON.stringify(
      {
        connections: conns.map((c) => ({
          user: c.line?.username,
          stream: c.stream?.name,
          ip: c.ip,
          ageSec: Math.round((now - +c.lastSeenAt) / 1000),
        })),
      },
      null,
      2
    )
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
