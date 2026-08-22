import { NextRequest, NextResponse } from "next/server";
import { verifyPayPalWebhook } from "@/lib/paypal-billing";
import { logActivity } from "@/lib/lines";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let event: { event_type?: string; resource?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const verified = await verifyPayPalWebhook(req.headers, rawBody).catch(() => false);
  if (!verified) {
    // Allow unverified in dev when webhook ID not set — log only
    const { getSettingGroup } = await import("@/lib/panel-settings");
    const billing = await getSettingGroup("billing");
    if (String(billing.paypalWebhookId ?? "").trim()) {
      return NextResponse.json({ error: "Webhook verification failed" }, { status: 401 });
    }
  }

  const eventType = event.event_type ?? "unknown";
  await logActivity("paypal_webhook", {
    entity: "billing",
    meta: { eventType, resource: event.resource ?? null },
  });

  if (eventType === "PAYMENT.CAPTURE.COMPLETED" || eventType === "CHECKOUT.ORDER.APPROVED") {
    const resource = event.resource ?? {};
    await logActivity("paypal_payment_completed", {
      entity: "billing",
      entityId: String(resource.id ?? ""),
      meta: resource,
    });
  }

  return NextResponse.json({ ok: true });
}
