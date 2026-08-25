import { getSettingGroup } from "@/lib/panel-settings";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
  base: string;
};

export async function getPayPalConfig(): Promise<PayPalConfig | null> {
  const billing = await getSettingGroup("billing");
  const clientId = String(billing.paypalClientId ?? "").trim();
  const clientSecret = String(billing.paypalClientSecret ?? "").trim();
  if (!clientId || !clientSecret) return null;
  const sandbox = billing.paypalSandbox !== false;
  const base = sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  return { clientId, clientSecret, sandbox, base };
}

export async function getPayPalAccessToken(cfg: PayPalConfig): Promise<string> {
  const tokenRes = await fetch(`${cfg.base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description ?? "PayPal auth failed");
  }
  return tokenJson.access_token;
}

export async function createPayPalOrder(opts: {
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  customId?: string;
}): Promise<{ orderId: string; approveUrl?: string }> {
  const cfg = await getPayPalConfig();
  if (!cfg) throw new Error("PayPal not configured");
  const token = await getPayPalAccessToken(cfg);
  const orderRes = await fetch(`${cfg.base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: opts.currency, value: opts.amount.toFixed(2) },
          description: opts.description,
          ...(opts.customId ? { custom_id: opts.customId.slice(0, 127) } : {}),
        },
      ],
      application_context: {
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    }),
  });
  const order = (await orderRes.json()) as { id?: string; links?: { rel: string; href: string }[]; message?: string };
  if (!orderRes.ok || !order.id) {
    throw new Error(order.message ?? "PayPal order create failed");
  }
  const approve = order.links?.find((l) => l.rel === "approve")?.href;
  return { orderId: order.id, approveUrl: approve };
}

export async function capturePayPalOrder(orderId: string): Promise<{
  status: string;
  captureId?: string;
  amount?: string;
  currency?: string;
}> {
  const cfg = await getPayPalConfig();
  if (!cfg) throw new Error("PayPal not configured");
  const token = await getPayPalAccessToken(cfg);
  const res = await fetch(`${cfg.base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await res.json()) as {
    status?: string;
    purchase_units?: {
      payments?: {
        captures?: { id: string; amount?: { value: string; currency_code: string } }[];
      };
    }[];
    message?: string;
  };
  if (!res.ok) throw new Error(data.message ?? "PayPal capture failed");
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: data.status ?? "UNKNOWN",
    captureId: capture?.id,
    amount: capture?.amount?.value,
    currency: capture?.amount?.currency_code,
  };
}

export async function verifyPayPalWebhook(
  headers: Headers,
  rawBody: string
): Promise<boolean> {
  const cfg = await getPayPalConfig();
  if (!cfg) return false;
  const webhookId = String((await getSettingGroup("billing")).paypalWebhookId ?? "").trim();
  if (!webhookId) return false;

  const token = await getPayPalAccessToken(cfg);
  const res = await fetch(`${cfg.base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  });
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
