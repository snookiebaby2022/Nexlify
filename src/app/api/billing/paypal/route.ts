import { NextRequest, NextResponse } from "next/server";
import { createPayPalOrder, getPayPalConfig } from "@/lib/paypal-billing";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

/** PayPal Orders v2 — create checkout order. */
export async function POST(req: NextRequest) {
  try {
    const cfg = await getPayPalConfig();
    if (!cfg) {
      return NextResponse.json(
        { error: "PayPal not configured. Set client ID and secret under Admin → Billing." },
        { status: 503 }
      );
    }

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const amount = Number(body.amount ?? 0);
    const currency = String(body.currency ?? "GBP").toUpperCase();
    const couponCode = body.couponCode ? String(body.couponCode).trim().toUpperCase() : undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount required" }, { status: 400 });
    }

    const order = await createPayPalOrder({
      amount,
      currency,
      description: couponCode ? `Nexlify license (${couponCode})` : "Nexlify license",
      returnUrl: String(body.returnUrl ?? "https://nexlify.live/register?paid=1"),
      cancelUrl: String(body.cancelUrl ?? "https://nexlify.live/pricing"),
    });

    return NextResponse.json({
      ok: true,
      orderId: order.orderId,
      approveUrl: order.approveUrl,
      sandbox: cfg.sandbox,
      couponCode,
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
