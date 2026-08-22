import { NextRequest, NextResponse } from "next/server";
import { capturePayPalOrder } from "@/lib/paypal-billing";
import { logActivity } from "@/lib/lines";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

/** Capture a PayPal order after buyer approval (Orders v2). */
export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const orderId = String(parsed.data.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

    const result = await capturePayPalOrder(orderId);
    await logActivity("paypal_capture", {
      entity: "billing",
      entityId: orderId,
      meta: {
        status: result.status,
        captureId: result.captureId,
        amount: result.amount,
        currency: result.currency,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
