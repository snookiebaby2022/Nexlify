import { NextRequest, NextResponse } from "next/server";
import { runAllCronJobs, runHourlyCronJobs } from "@/lib/cron-jobs";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
    }
  } else if (secret !== expected) {
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
