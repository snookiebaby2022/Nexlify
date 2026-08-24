/**
 * Runs panel cron jobs on a schedule (start with PM2: nexlify-cron).
 * Minute tick: runAllCronJobs · Hourly: runHourlyCronJobs
 *
 * Uses Redis-based distributed locking so only one instance runs jobs
 * across a multi-instance / cluster deployment.
 *
 * Soft memory guard: after each tick, if RSS is high, exit so PM2 restarts
 * a fresh lean process (prevents tsx heap growth after large imports).
 */
import { runAllCronJobs, runHourlyCronJobs } from "../src/lib/cron-jobs";
import { getRedis } from "../src/lib/redis";

const MINUTE_MS = 60_000;
const LOCK_TTL_S = 300; // 5-minute safety net
const MINUTE_LOCK_KEY = "nexlify:cron:minute";
const HOURLY_LOCK_KEY = "nexlify:cron:hourly";
/** Exit for PM2 recycle when RSS exceeds this (MB). */
const RECYCLE_RSS_MB = Number(process.env.NEXLIFY_CRON_RECYCLE_RSS_MB ?? "1200");

/**
 * Seed with the current UTC hour so the first tick after start/restart does NOT
 * fire runHourlyCronJobs. Otherwise every pm2 restart (and memory recycle) re-runs
 * pg_dump / panel_backup mid-deploy while Postgres may still be coming up.
 */
let lastHour = new Date().getUTCHours();

async function acquireLock(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // Redis down — run anyway (best effort)
  try {
    const ok = await redis.set(key, "1", "EX", LOCK_TTL_S, "NX");
    return ok === "OK";
  } catch {
    return true; // Redis error — run anyway
  }
}

async function releaseLock(key: string) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    /* ignore */
  }
}

function maybeRecycleForMemory() {
  const rssMb = process.memoryUsage().rss / (1024 * 1024);
  if (rssMb < RECYCLE_RSS_MB) return;
  console.log(
    `[nexlify-cron] RSS ${rssMb.toFixed(0)}MB >= ${RECYCLE_RSS_MB}MB — exiting for PM2 recycle`
  );
  // Give logs a moment to flush, then exit cleanly (PM2 autorestart).
  setTimeout(() => process.exit(0), 250);
}

async function tickMinute() {
  if (!(await acquireLock(MINUTE_LOCK_KEY))) {
    console.log("[nexlify-cron] another instance holds the minute lock — skipping");
    return;
  }

  try {
    await runAllCronJobs();
    const h = new Date().getUTCHours();
    if (h !== lastHour) {
      lastHour = h;
      if (await acquireLock(HOURLY_LOCK_KEY)) {
        try {
          await runHourlyCronJobs();
        } catch (e) {
          console.error("[nexlify-cron] hourly jobs error", e);
        } finally {
          await releaseLock(HOURLY_LOCK_KEY);
        }
      } else {
        console.log("[nexlify-cron] another instance holds the hourly lock — skipping");
      }
    }
    console.log(`[nexlify-cron] ${new Date().toISOString()} minute jobs ok`);
  } catch (e) {
    console.error("[nexlify-cron] minute jobs error", e);
  } finally {
    await releaseLock(MINUTE_LOCK_KEY);
    maybeRecycleForMemory();
  }
}

console.log(
  `[nexlify-cron] daemon started (recycle RSS>${RECYCLE_RSS_MB}MB, heap cap via NODE_OPTIONS)`
);
void tickMinute();
setInterval(() => void tickMinute(), MINUTE_MS);
