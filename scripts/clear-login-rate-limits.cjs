#!/usr/bin/env node
/** Clear login rate-limit / flood locks (PanelSetting + Redis). Run on panel host. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const del = await p.panelSetting.deleteMany({
    where: {
      OR: [{ key: { startsWith: "login_rl:" } }, { key: { startsWith: "login_flood:" } }],
    },
  });
  let redisKeys = 0;
  try {
    const Redis = require("ioredis");
    const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
    const redis = new Redis(url, { maxRetriesPerRequest: 1 });
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "nexlify:login_flood:*", "COUNT", 200);
      cursor = next;
      if (keys.length) {
        await redis.unlink(...keys);
        redisKeys += keys.length;
      }
    } while (cursor !== "0");
    await redis.quit();
  } catch {
    /* redis optional */
  }
  console.log(JSON.stringify({ panelSettingsRemoved: del.count, redisFloodKeysRemoved: redisKeys }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
