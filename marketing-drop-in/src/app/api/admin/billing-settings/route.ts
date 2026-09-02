import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { stripeWebhookUrl } from "@/lib/app-url";
import {
  billingSettingsForAdmin,
  getStripeSecretKey,
  isPayPalConfigured,
  isStripeConfigured,
  saveBillingSettings,
  type BillingSettings,
} from "@/lib/billing-settings";
import { resetStripeClient } from "@/lib/stripe";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    ...billingSettingsForAdmin(),
    webhookUrl: stripeWebhookUrl(),
    links: {
      stripeDashboard: "https://dashboard.stripe.com/",
      stripeWebhooks: "https://dashboard.stripe.com/webhooks",
      stripeApiKeys: "https://dashboard.stripe.com/apikeys",
      paypalDeveloper: "https://developer.paypal.com/dashboard/applications/live",
      paypalSandbox: "https://developer.paypal.com/dashboard/applications/sandbox",
    },
  });
}

export async function PATCH(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<BillingSettings> = {};

  if (typeof body.stripeSecretKey === "string") {
    updates.stripeSecretKey = body.stripeSecretKey.slice(0, 500);
  }
  if (typeof body.stripeWebhookSecret === "string") {
    updates.stripeWebhookSecret = body.stripeWebhookSecret.slice(0, 500);
  }
  if (typeof body.stripePublishableKey === "string") {
    updates.stripePublishableKey = body.stripePublishableKey.slice(0, 200);
  }
  if (typeof body.paypalClientId === "string") {
    updates.paypalClientId = body.paypalClientId.slice(0, 200);
  }
  if (typeof body.paypalClientSecret === "string") {
    updates.paypalClientSecret = body.paypalClientSecret.slice(0, 500);
  }
  if (typeof body.paypalWebhookId === "string") {
    updates.paypalWebhookId = body.paypalWebhookId.slice(0, 200);
  }
  if (typeof body.paypalSandbox === "boolean") {
    updates.paypalSandbox = body.paypalSandbox;
  }

  saveBillingSettings(updates);
  resetStripeClient();

  await logAudit({
    email: user.email,
    action: "billing_settings_update",
    detail: Object.keys(updates).join(", "),
  });

  return NextResponse.json({
    ...billingSettingsForAdmin(),
    webhookUrl: stripeWebhookUrl(),
    links: {
      stripeDashboard: "https://dashboard.stripe.com/",
      stripeWebhooks: "https://dashboard.stripe.com/webhooks",
      stripeApiKeys: "https://dashboard.stripe.com/apikeys",
      paypalDeveloper: "https://developer.paypal.com/dashboard/applications/live",
      paypalSandbox: "https://developer.paypal.com/dashboard/applications/sandbox",
    },
  });
}

/** Quick connectivity check after saving keys. */
export async function POST() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const results: Record<string, { ok: boolean; message: string }> = {};

  if (isStripeConfigured()) {
    try {
      const { getStripe } = await import("@/lib/stripe");
      await getStripe().products.list({ limit: 1 });
      results.stripe = { ok: true, message: "Stripe API connected" };
    } catch (e) {
      results.stripe = {
        ok: false,
        message: e instanceof Error ? e.message : "Stripe connection failed",
      };
    }
  } else {
    results.stripe = { ok: false, message: "Stripe secret key not set" };
  }

  if (isPayPalConfigured()) {
    try {
      const { getPayPalAccessToken, getPayPalConfig } = await import("@/lib/paypal-billing");
      const cfg = await getPayPalConfig();
      if (!cfg) throw new Error("PayPal config missing");
      await getPayPalAccessToken(cfg);
      results.paypal = { ok: true, message: `PayPal connected (${cfg.sandbox ? "sandbox" : "live"})` };
    } catch (e) {
      results.paypal = {
        ok: false,
        message: e instanceof Error ? e.message : "PayPal connection failed",
      };
    }
  } else {
    results.paypal = { ok: false, message: "PayPal client ID / secret not set" };
  }

  return NextResponse.json({
    ok: Object.values(results).some((r) => r.ok),
    stripeKeyPreview: getStripeSecretKey().slice(0, 12) + "…",
    results,
  });
}
