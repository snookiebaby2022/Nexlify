import { NextResponse } from "next/server";
import { getBillingSettings } from "@/lib/billing-settings";
import { verifyPayPalWebhook } from "@/lib/paypal-billing";
import { handlePayPalWebhookEvent } from "@/lib/paypal-subscription-billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookId = getBillingSettings().paypalWebhookId.trim();
  if (!webhookId) {
    console.error("[paypal/webhook] PayPal webhook ID not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const verified = await verifyPayPalWebhook(request.headers, rawBody);
  if (!verified) {
    console.error("[paypal/webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event_type?: string; resource?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await handlePayPalWebhookEvent(event);
  } catch (e) {
    console.error("[paypal/webhook] handler", event.event_type, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
