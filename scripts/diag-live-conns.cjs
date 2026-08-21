#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const username = process.argv[2] || "";
  const streamQuery = process.argv[3] || "Only Fools";

  const line = username
    ? await p.line.findFirst({
        where: { username: { contains: username, mode: "insensitive" } },
        select: { id: true, username: true, maxConnections: true },
      })
    : null;
  const stream = await p.stream.findFirst({
    where: { name: { contains: streamQuery, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  const conns = await p.liveConnection.findMany({
    where: line ? { lineId: line.id } : {},
    orderBy: { lastSeenAt: "desc" },
    take: 15,
    include: { stream: { select: { name: true } }, line: { select: { username: true } } },
  });
  const allRecent = await p.liveConnection.findMany({
    where: { lastSeenAt: { gte: new Date(Date.now() - 600_000) } },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
    include: { stream: { select: { name: true } }, line: { select: { username: true } } },
  });

  const now = Date.now();
  console.log(
    JSON.stringify(
      {
        line,
        stream,
        liveStaleMs: 120_000,
        connections: conns.map((c) => ({
          id: c.id,
          user: c.line?.username,
          stream: c.stream?.name,
          streamId: c.streamId,
          ip: c.ip,
          startedAt: c.startedAt,
          lastSeenAt: c.lastSeenAt,
          ageSec: Math.round((now - new Date(c.lastSeenAt).getTime()) / 1000),
          visibleInPanel: now - new Date(c.lastSeenAt).getTime() <= 120_000,
        })),
        allRecent: allRecent.map((c) => ({
          user: c.line?.username,
          stream: c.stream?.name,
          ip: c.ip,
          ageSec: Math.round((now - new Date(c.lastSeenAt).getTime()) / 1000),
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
