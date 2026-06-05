import { runAllCronJobs, runHourlyCronJobs } from "../src/lib/cron-jobs";

const hourly = process.argv.includes("--hourly");

async function main() {
  if (hourly) await runHourlyCronJobs();
  else await runAllCronJobs();
  console.log("Cron jobs finished.");
}

main().catch(console.error);
