import { NextRequest, NextResponse } from "next/server";
import { handleBillingWebhook, type BillingPayload } from "@/lib/billing";

export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-billing-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    null;

  let body: BillingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const result = await handleBillingWebhook(body, secret ?? body.secret ?? null);
  const status = result.ok ? 200 : result.error?.includes("secret") ? 401 : 400;
  return NextResponse.json(result, { status });
}
