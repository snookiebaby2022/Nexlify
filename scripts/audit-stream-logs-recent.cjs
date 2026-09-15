#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const since = new Date(Date.now() - 6 * 3600_000);
  const [byAction, playbackDrops, relayErrors] = await Promise.all([
    p.activityLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
      take: 15,
    }),
    p.activityLog.findMany({
      where: {
        createdAt: { gte: since },
        action: "playback_drop",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { createdAt: true, detail: true, status: true },
    }),
    p.activityLog.findMany({
      where: {
        createdAt: { gte: since },
        action: "stream_hls_relay_error",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { createdAt: true, detail: true },
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        since: since.toISOString(),
        topActions: byAction.map((r) => ({ action: r.action, count: r._count._all })),
        playbackDrops,
        relayErrors,
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
