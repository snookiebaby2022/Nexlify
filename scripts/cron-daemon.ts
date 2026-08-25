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
import { plexSyncIsBusy, pumpPlexSyncQueue } from "../src/lib/plex-sync-queue";
import { writeFileSync } from "fs";

const MINUTE_MS = 60_000;
const LOCK_TTL_S = 300; // 5-minute safety net
const MINUTE_LOCK_KEY = "nexlify:cron:minute";
/** Exit for PM2 recycle when RSS exceeds this (MB). */
const RECYCLE_RSS_MB = Number(process.env.NEXLIFY_CRON_RECYCLE_RSS_MB ?? "1200");

/**
 * Hourly jobs must survive PM2 recycle. Seeding lastHour to "now" meant a
 * process that restarts inside the same hour never fired runHourlyCronJobs.
 */
function localHourStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}`;
}

async function acquireHourlySlot(): Promise<boolean> {
  const stamp = localHourStamp();
  const redis = getRedis();
  const key = `nexlify:cron:hourly:${stamp}`;
  if (redis) {
    try {
      const ok = await redis.set(key, "1", "EX", 7200, "NX");
      return ok === "OK";
    } catch {
      /* fall through to file slot */
    }
  }
  try {
    writeFileSync(`/tmp/nexlify-cron-hourly-${stamp}`, "1", { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

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
  if (plexSyncIsBusy()) {
    console.log("[nexlify-cron] skipping RSS recycle while Plex sync is running");
    return;
  }
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
    if (await acquireHourlySlot()) {
      try {
        await runHourlyCronJobs();
      } catch (e) {
        console.error("[nexlify-cron] hourly jobs error", e);
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
void pumpPlexSyncQueue().catch((e) => {
  console.error("[nexlify-cron] plex sync pump", e);
});
setInterval(() => {
  void pumpPlexSyncQueue().catch((e) => {
    console.error("[nexlify-cron] plex sync pump", e);
  });
}, 5_000);
