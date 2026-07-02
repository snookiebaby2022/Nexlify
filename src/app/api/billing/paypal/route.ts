import { NextRequest, NextResponse } from "next/server";
import { getSettingGroup } from "@/lib/panel-settings";

/** PayPal Orders v2 create-order stub wired to panel billing settings. */
export async function POST(req: NextRequest) {
  const billing = await getSettingGroup("billing");
  const clientId = String(billing.paypalClientId ?? "").trim();
  const clientSecret = String(billing.paypalClientSecret ?? "").trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "PayPal not configured. Set client ID and secret under Admin → Billing." },
      { status: 503 }
    );
  }

  const body = await req.json();
  const amount = Number(body.amount ?? 0);
  const currency = String(body.currency ?? "GBP").toUpperCase();
  const couponCode = body.couponCode ? String(body.couponCode).trim().toUpperCase() : undefined;

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount required" }, { status: 400 });
  }

  const sandbox = billing.paypalSandbox !== false;
  const base = sandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    return NextResponse.json(
      { error: tokenJson.error_description ?? "PayPal auth failed" },
      { status: 502 }
    );
  }

  const orderRes = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: currency, value: amount.toFixed(2) },
          description: couponCode
            ? `Nexlify license (${couponCode})`
            : "Nexlify license",
        },
      ],
      application_context: {
        return_url: String(body.returnUrl ?? "https://nexlify.live/register?paid=1"),
        cancel_url: String(body.cancelUrl ?? "https://nexlify.live/pricing"),
      },
    }),
  });
  const order = (await orderRes.json()) as { id?: string; links?: { rel: string; href: string }[] };
  if (!orderRes.ok || !order.id) {
    return NextResponse.json({ error: "PayPal order create failed" }, { status: 502 });
  }

  const approve = order.links?.find((l) => l.rel === "approve")?.href;
  return NextResponse.json({
    ok: true,
    orderId: order.id,
    approveUrl: approve,
    sandbox,
    couponCode,
  });
}
