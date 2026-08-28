require(require("path").join(__dirname, "load-env.cjs")).loadEnv();
const fs = require("fs");
const path = require("path");
const Redis = require("ioredis");

const u = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const r = new Redis(u, { maxRetriesPerRequest: 1, enableReadyCheck: false });

function catalogDirs() {
  const dirs = [];
  const env = (process.env.NEXLIFY_CATALOG_CACHE_DIR || "").trim();
  if (env) dirs.push(env);
  dirs.push("/var/lib/nexlify/catalog-cache");
  dirs.push(path.join(require("os").tmpdir(), "nexlify-catalog-cache"));
  return [...new Set(dirs)];
}

function purgeDisk() {
  let n = 0;
  for (const dir of catalogDirs()) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.startsWith("xtream-")) continue;
      try {
        fs.unlinkSync(path.join(dir, name));
        n += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return n;
}

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
  const disk = purgeDisk();
  const redis = (await scanDel("nexlify:xtream:*")) + (await scanDel("xtream:*"));
  console.log("cleared redis", redis, "xtream keys; deleted", disk, "disk catalog blobs");
  await r.quit();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
