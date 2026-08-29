#!/usr/bin/env node
/** Clear Redis playback/live-auth/edge-auth caches after URL repairs or duplicate purge. */
require(require("path").join(__dirname, "load-env.cjs")).loadEnv();
const Redis = require("ioredis");

const u = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const r = new Redis(u, { maxRetriesPerRequest: 1, enableReadyCheck: false });

async function scanDel(pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await r.scan(cursor, "MATCH", pattern, "COUNT", 500);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");
  if (!keys.length) return 0;
  for (let i = 0; i < keys.length; i += 200) {
    await r.del(...keys.slice(i, i + 200));
  }
  return keys.length;
}

(async () => {
  const patterns = [
    "nexlify:playback:url:*",
    "nexlify:playback:urls:*",
    "nexlify:live-auth:*",
    "edge-auth:*",
    "nexlify:xtream:*",
    "xtream:*",
  ];
  let total = 0;
  for (const p of patterns) {
    const n = await scanDel(p);
    if (n) console.log(`cleared ${n} keys matching ${p}`);
    total += n;
  }
  console.log(JSON.stringify({ cleared: total }, null, 2));
  await r.quit();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
