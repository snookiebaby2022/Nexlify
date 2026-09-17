#!/usr/bin/env node
/**
 * Aggressive connection enforcer: drop over-cap + stale every pass.
 * Intended as a short-interval cron companion to the 1-minute job.
 *
 * Stale window must stay well above edge pulse intervals. A 3-minute cut while
 * panel :13000 is resetting pulses kicks healthy viewers and looks like buffering.
 */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

const STALE_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.NEXLIFY_CONN_STALE_MS || 10 * 60 * 1000) || 10 * 60 * 1000
);

(async () => {
  const p = new PrismaClient();
  try {
    const over = await p.$queryRawUnsafe(`
      SELECT l.id AS "lineId", l.username, l."maxConnections", count(lc.id)::int AS open_conns
      FROM "LiveConnection" lc
      JOIN "Line" l ON l.id = lc."lineId"
      WHERE lc."streamId" IS NOT NULL
      GROUP BY l.id
      HAVING count(lc.id) > GREATEST(l."maxConnections", 0)
    `);
    let dropped = 0;
    for (const row of over) {
      const keep = Math.max(0, Number(row.maxConnections) || 0);
      const conns = await p.liveConnection.findMany({
        where: { lineId: row.lineId, streamId: { not: null } },
        orderBy: { lastSeenAt: "desc" },
        select: { id: true },
      });
      const ids = conns.slice(keep).map((c) => c.id);
      if (!ids.length) continue;
      dropped += (await p.liveConnection.deleteMany({ where: { id: { in: ids } } })).count;
    }
    const stale = await p.liveConnection.deleteMany({
      where: { lastSeenAt: { lt: new Date(Date.now() - STALE_MS) } },
    });
    // Also collapse duplicate (lineId, streamId, ip) keeping newest
    const dups = await p.$executeRawUnsafe(`
      DELETE FROM "LiveConnection" a
      USING "LiveConnection" b
      WHERE a.id < b.id
        AND a."lineId" = b."lineId"
        AND a."streamId" = b."streamId"
        AND coalesce(a.ip,'') = coalesce(b.ip,'')
    `);
    console.log(
      JSON.stringify({
        overLines: over.length,
        droppedExtras: dropped,
        droppedStaleMs: STALE_MS,
        droppedStale: stale.count,
        droppedDupPairs: dups,
        remaining: await p.liveConnection.count(),
      })
    );
  } finally {
    await p.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
