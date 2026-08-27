import { NextResponse } from "next/server";
import { expirePastDueLicenses } from "@/lib/stripe-billing";

/** Secure cron: mark past-due licenses EXPIRED. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || process.env.BILLING_WEBHOOK_SECRET?.trim();
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request.headers.get("x-cron-secret")?.trim() ||
    "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await expirePastDueLicenses();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return POST(request);
}
