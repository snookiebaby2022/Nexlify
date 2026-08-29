#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { ensureRedisConnected, getRedis } = require("../src/lib/redis");
(async () => {
  const ok = await ensureRedisConnected();
  const r = getRedis();
  console.log("connected:", ok, "status:", r?.status);
  if (ok && r) {
    console.log("ping:", await r.ping());
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
