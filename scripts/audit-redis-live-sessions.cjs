#!/usr/bin/env node
/** Compare Redis live:session:* vs Postgres LiveConnection (run on panel host). */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const Redis = require("ioredis");

function parseKey(key) {
  const prefix = "live:session:";
  const k = key.startsWith("nexlify:") ? key.slice("nexlify:".length) : key;
  if (!k.startsWith(prefix)) return null;
  const rest = k.slice(prefix.length);
  const i1 = rest.indexOf(":");
  if (i1 <= 0) return null;
  const lineId = rest.slice(0, i1);
  const rest2 = rest.slice(i1 + 1);
  const i2 = rest2.indexOf(":");
  if (i2 <= 0) return null;
  const streamId = rest2.slice(0, i2);
  const ipRaw = rest2.slice(i2 + 1);
  const ip = !ipRaw || ipRaw === "*" ? null : ipRaw;
  return { lineId, streamId, ip };
}

(async () => {
  const url = process.env.REDIS_URL || process.env.SLOTS_REDIS_URL || "redis://127.0.0.1:6379";
  const redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 5000 });
  const p = new PrismaClient();
  const fiveMin = Date.now() - 5 * 60_000;

  const sessions = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "nexlify:live:session:*", "COUNT", 500);
    cursor = next;
    for (const full of keys) {
      const row = parseKey(full);
      if (row) sessions.push(row);
    }
  } while (cursor !== "0");

  const byPair = new Map();
  const lines = new Set();
  for (const s of sessions) {
    lines.add(s.lineId);
    const k = `${s.lineId}|${s.streamId}|${s.ip || ""}`;
    byPair.set(k, s);
  }

  const dbRecent = await p.liveConnection.count({
    where: { lastSeenAt: { gte: new Date(fiveMin) } },
  });
  const dbLines = await p.liveConnection.groupBy({
    by: ["lineId"],
    where: { lastSeenAt: { gte: new Date(fiveMin) } },
  });

  let slotMembers = 0;
  cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "nexlify:conn:slots:*", "COUNT", 200);
    cursor = next;
    for (const k of keys) {
      slotMembers += await redis.scard(k);
    }
  } while (cursor !== "0");

  console.log(
    JSON.stringify(
      {
        redisSessionKeys: sessions.length,
        redisDistinctViewerSessions: byPair.size,
        redisDistinctLines: lines.size,
        redisConnSlotMembers: slotMembers,
        dbConnections5m: dbRecent,
        dbDistinctLines5m: dbLines.length,
      },
      null,
      2
    )
  );

  await redis.quit();
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
