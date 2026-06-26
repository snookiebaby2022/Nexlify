/**
 * Runs panel cron jobs on a schedule (start with PM2: nexlify-cron).
 * Minute tick: runAllCronJobs · Hourly: runHourlyCronJobs
 */
import { runAllCronJobs, runHourlyCronJobs } from "../src/lib/cron-jobs";

const MINUTE_MS = 60_000;
let hourlyRunning = false;
let minuteRunning = false;
let lastHour = -1;

async function tickMinute() {
  if (minuteRunning) return;
  minuteRunning = true;
  try {
    await runAllCronJobs();
    const h = new Date().getHours();
    if (h !== lastHour) {
      lastHour = h;
      if (!hourlyRunning) {
        hourlyRunning = true;
        try {
          await runHourlyCronJobs();
        } finally {
          hourlyRunning = false;
        }
      }
    }
    console.log(`[nexlify-cron] ${new Date().toISOString()} minute jobs ok`);
  } catch (e) {
    console.error("[nexlify-cron] minute jobs error", e);
  } finally {
    minuteRunning = false;
  }
}

console.log("[nexlify-cron] daemon started");
void tickMinute();
setInterval(() => void tickMinute(), MINUTE_MS);
