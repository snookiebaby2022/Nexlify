#!/usr/bin/env node
/** Ops: repair LiveConnection rows from live:viewer:* Redis keys (same as panel sync). */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const Redis = require("ioredis");

function parseViewerKey(key) {
  const k = key.startsWith("nexlify:") ? key.slice(8) : key;
  const prefix = "live:viewer:";
  if (!k.startsWith(prefix)) return null;
  const rest = k.slice(prefix.length);
  const i = rest.indexOf(":");
  if (i <= 0) return null;
  const lineId = rest.slice(0, i);
  const ipRaw = rest.slice(i + 1);
  const ip = !ipRaw || ipRaw === "*" ? "" : ipRaw;
  return { lineId, ip };
}

(async () => {
  const url = process.env.REDIS_URL || process.env.SLOTS_REDIS_URL || "redis://127.0.0.1:6379";
  const redis = new Redis(url, { maxRetriesPerRequest: 1 });
  const p = new PrismaClient();
  const staleBefore = new Date(Date.now() - 120_000);
  const viewers = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "nexlify:live:viewer:*", "COUNT", 300);
    cursor = next;
    for (const full of keys) {
      const meta = parseViewerKey(full);
      if (!meta) continue;
      const streamId = await redis.get(full);
      if (!streamId || !String(streamId).trim()) continue;
      viewers.push({ ...meta, streamId: String(streamId).trim() });
    }
  } while (cursor !== "0");

  let synced = 0;
  const now = new Date();
  for (const v of viewers.slice(0, 800)) {
    const existing = await p.liveConnection.findFirst({
      where: {
        lineId: v.lineId,
        streamId: v.streamId,
        ip: v.ip,
        lastSeenAt: { gte: staleBefore },
      },
      select: { id: true },
    });
    if (existing) continue;
    const line = await p.line.findUnique({
      where: { id: v.lineId },
      select: { status: true, expiresAt: true },
    });
    const stream = await p.stream.findUnique({ where: { id: v.streamId }, select: { id: true } });
    if (!line || !stream || line.status !== "ACTIVE" || line.expiresAt <= now) continue;
    await p.liveConnection
      .upsert({
        where: { lineId_streamId_ip: { lineId: v.lineId, streamId: v.streamId, ip: v.ip } },
        create: { lineId: v.lineId, streamId: v.streamId, ip: v.ip, lastSeenAt: now },
        update: { lastSeenAt: now },
      })
      .catch(() => undefined);
    synced += 1;
  }

  const fiveMin = new Date(Date.now() - 5 * 60_000);
  const dbRecent = await p.liveConnection.count({ where: { lastSeenAt: { gte: fiveMin } } });
  console.log(JSON.stringify({ redisViewers: viewers.length, synced, dbConnections5m: dbRecent }, null, 2));
  await redis.quit();
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
