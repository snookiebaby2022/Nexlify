/**
 * Runs panel cron jobs on a schedule (start with PM2: nexlify-cron).
 * Minute tick: runAllCronJobs · Hourly: runHourlyCronJobs
 *
 * Uses Redis-based distributed locking so only one instance runs jobs
 * across a multi-instance / cluster deployment.
 */
import { runAllCronJobs, runHourlyCronJobs } from "../src/lib/cron-jobs";
import { getRedis } from "../src/lib/redis";

const MINUTE_MS = 60_000;
const LOCK_TTL_S = 300; // 5-minute safety net
const MINUTE_LOCK_KEY = "nexlify:cron:minute";
const HOURLY_LOCK_KEY = "nexlify:cron:hourly";

let lastHour = -1;

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

async function tickMinute() {
  if (!(await acquireLock(MINUTE_LOCK_KEY))) {
    console.log("[nexlify-cron] another instance holds the minute lock — skipping");
    return;
  }

  try {
    await runAllCronJobs();
    const h = new Date().getHours();
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
  }
}

console.log("[nexlify-cron] daemon started");
void tickMinute();
setInterval(() => void tickMinute(), MINUTE_MS);
