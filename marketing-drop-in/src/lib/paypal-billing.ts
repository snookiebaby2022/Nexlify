import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getBillingSettings } from "@/lib/billing-settings";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
  base: string;
};

type PayPalCatalog = {
  productId?: string;
  plans: Record<string, string>;
};

const CATALOG_FILE = join(process.cwd(), "data", "paypal-catalog.json");

export async function getPayPalConfig(): Promise<PayPalConfig | null> {
  const billing = getBillingSettings();
  const clientId = billing.paypalClientId.trim();
  const clientSecret = billing.paypalClientSecret.trim();
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

async function paypalApi<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const cfg = await getPayPalConfig();
  if (!cfg) throw new Error("PayPal not configured");
  const token = await getPayPalAccessToken(cfg);
  const res = await fetch(`${cfg.base}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json()) as T & { message?: string; details?: { issue: string }[] };
  if (!res.ok) {
    const detail = data.details?.[0]?.issue;
    throw new Error(detail ?? data.message ?? `PayPal API ${path} failed (${res.status})`);
  }
  return data;
}

function readCatalog(): PayPalCatalog {
  try {
    if (existsSync(CATALOG_FILE)) {
      return JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as PayPalCatalog;
    }
  } catch {
    /* ignore */
  }
  return { plans: {} };
}

function writeCatalog(catalog: PayPalCatalog): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}

function planCacheKey(currency: string, amountCents: number): string {
  return `${currency.toUpperCase()}:${amountCents}`;
}

async function getOrCreateProduct(catalog: PayPalCatalog): Promise<string> {
  if (catalog.productId) return catalog.productId;
  const product = await paypalApi<{ id: string }>("/v1/catalogs/products", {
    body: {
      name: "Nexlify Panel License",
      description: "Monthly Nexlify IPTV panel license subscription",
      type: "SERVICE",
      category: "SOFTWARE",
    },
  });
  catalog.productId = product.id;
  writeCatalog(catalog);
  return product.id;
}

/** Monthly PayPal billing plan for a currency + price (cached on disk). */
export async function getOrCreatePayPalPlan(opts: {
  amountMajor: number;
  currency: string;
  planName: string;
}): Promise<string> {
  const currency = opts.currency.toUpperCase();
  const amountCents = Math.round(opts.amountMajor * 100);
  const key = planCacheKey(currency, amountCents);
  const catalog = readCatalog();
  if (catalog.plans[key]) return catalog.plans[key];

  const productId = await getOrCreateProduct(catalog);
  const value = opts.amountMajor.toFixed(2);
  const plan = await paypalApi<{ id: string }>("/v1/billing/plans", {
    body: {
      product_id: productId,
      name: `${opts.planName} (${currency} ${value}/month)`,
      description: "Monthly Nexlify panel license — renews automatically",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value, currency_code: currency },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    },
  });

  catalog.plans[key] = plan.id;
  writeCatalog(catalog);
  return plan.id;
}

export async function createPayPalSubscription(opts: {
  planId: string;
  returnUrl: string;
  cancelUrl: string;
  customId?: string;
  subscriberEmail?: string;
}): Promise<{ subscriptionId: string; approveUrl?: string }> {
  const sub = await paypalApi<{
    id?: string;
    status?: string;
    links?: { rel: string; href: string }[];
  }>("/v1/billing/subscriptions", {
    body: {
      plan_id: opts.planId,
      custom_id: opts.customId?.slice(0, 127),
      subscriber: opts.subscriberEmail ? { email_address: opts.subscriberEmail } : undefined,
      application_context: {
        brand_name: "Nexlify",
        locale: "en-GB",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: {
          payer_selected: "PAYPAL",
          payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
        },
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    },
  });

  if (!sub.id) throw new Error("PayPal subscription create failed");
  const approve = sub.links?.find((l) => l.rel === "approve")?.href;
  return { subscriptionId: sub.id, approveUrl: approve };
}

export type PayPalSubscription = {
  id: string;
  status: string;
  custom_id?: string;
  plan_id?: string;
};

export async function getPayPalSubscription(subscriptionId: string): Promise<PayPalSubscription> {
  return paypalApi<PayPalSubscription>(
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

export function isPayPalSubscriptionActive(status: string): boolean {
  return status === "ACTIVE" || status === "APPROVED";
}

export async function verifyPayPalWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const cfg = await getPayPalConfig();
  if (!cfg) return false;
  const webhookId = getBillingSettings().paypalWebhookId.trim();
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

/** @deprecated Legacy one-time capture. */
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
