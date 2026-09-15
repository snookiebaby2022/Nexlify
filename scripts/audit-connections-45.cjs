#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const now = new Date();
  const fiveMin = new Date(Date.now() - 5 * 60_000);

  const liveRows = await p.liveConnection.count();
  const liveRecent = await p.liveConnection.count({ where: { lastSeenAt: { gte: fiveMin } } });
  const linesActive = await p.line.count({
    where: { status: "ACTIVE", expiresAt: { gt: now } },
  });
  const linesSeen = await p.line.count({
    where: {
      status: "ACTIVE",
      expiresAt: { gt: now },
      lastWatchedAt: { gte: fiveMin },
    },
  });

  const byLine = await p.liveConnection.groupBy({
    by: ["lineId"],
    _count: { _all: true },
    where: { lastSeenAt: { gte: fiveMin } },
  });

  const sample = await p.liveConnection.findMany({
    where: { lastSeenAt: { gte: fiveMin } },
    take: 8,
    orderBy: { lastSeenAt: "desc" },
    select: { lineId: true, streamId: true, ip: true, lastSeenAt: true, startedAt: true },
  });

  console.log(
    JSON.stringify(
      {
        liveConnectionTotal: liveRows,
        liveConnectionActive5m: liveRecent,
        distinctLines5m: byLine.length,
        activeNonExpiredLines: linesActive,
        linesWithActivity5m: linesSeen,
        sample,
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
