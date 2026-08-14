import { NextRequest, NextResponse } from "next/server";
import { runAllCronJobs, runHourlyCronJobs } from "@/lib/cron-jobs";
import { secretsEqual } from "@/lib/secrets-equal";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (!secretsEqual(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hourly = req.nextUrl.searchParams.get("hourly") === "1";

  if (hourly) {
    await runHourlyCronJobs();
  } else {
    await runAllCronJobs();
  }

  return NextResponse.json({ ok: true, hourly });
}
