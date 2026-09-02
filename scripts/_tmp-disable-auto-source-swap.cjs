#!/usr/bin/env node
"use strict";
const { PrismaClient } = require("@prisma/client");
const Redis = require("ioredis");
const prisma = new PrismaClient();

async function patch(key, data) {
  const row = await prisma.panelSetting.findUnique({ where: { key } });
  let cur = {};
  try {
    cur = row?.value ? JSON.parse(row.value) : {};
  } catch {
    cur = {};
  }
  const next = { ...cur, ...data };
  await prisma.panelSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  console.log(JSON.stringify({ key, ...data }));
}

(async () => {
  await patch("settings.source-swap", {
    sourceSwapEnabled: false,
    sourceSwapOnFailure: false,
    sourceSwapOnHighLoad: false,
  });
  await patch("settings.auto-fix", {
    autoFixEnabled: false,
    autoFixSourceSwitch: false,
  });
  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const r = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  let cursor = "0";
  let n = 0;
  do {
    const [next, keys] = await r.scan(cursor, "MATCH", "nexlify:failover:active:*", "COUNT", 200);
    cursor = next;
    if (keys.length) {
      await r.del(...keys);
      n += keys.length;
    }
  } while (cursor !== "0");
  console.log(JSON.stringify({ clearedFailoverKeys: n }));
  await r.quit();
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
