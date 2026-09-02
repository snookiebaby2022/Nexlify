import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MASKED_SECRET = "••••••••";

export type BillingSettings = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePublishableKey: string;
  paypalClientId: string;
  paypalClientSecret: string;
  paypalSandbox: boolean;
  paypalWebhookId: string;
};

const SETTINGS_DIR = join(process.cwd(), "data");
const SETTINGS_FILE = join(SETTINGS_DIR, "billing-settings.json");

const DEFAULTS: BillingSettings = {
  stripeSecretKey: "",
  stripeWebhookSecret: "",
  stripePublishableKey: "",
  paypalClientId: "",
  paypalClientSecret: "",
  paypalSandbox: true,
  paypalWebhookId: "",
};

function fromEnv(): Partial<BillingSettings> {
  const out: Partial<BillingSettings> = {};
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripePublishable =
    process.env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();

  if (stripeSecret) out.stripeSecretKey = stripeSecret;
  if (stripeWebhook) out.stripeWebhookSecret = stripeWebhook;
  if (stripePublishable) out.stripePublishableKey = stripePublishable;
  if (clientId) out.paypalClientId = clientId;
  if (clientSecret) out.paypalClientSecret = clientSecret;
  if (webhookId) out.paypalWebhookId = webhookId;
  if (process.env.PAYPAL_SANDBOX === "false") out.paypalSandbox = false;
  if (process.env.PAYPAL_SANDBOX === "true") out.paypalSandbox = true;
  return out;
}

function readFileSettings(): Partial<BillingSettings> {
  try {
    if (existsSync(SETTINGS_FILE)) {
      return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8")) as Partial<BillingSettings>;
    }
  } catch {
    /* ignore corrupt file */
  }
  return {};
}

export function getBillingSettings(): BillingSettings {
  return { ...DEFAULTS, ...fromEnv(), ...readFileSettings() };
}

function keepSecret(current: string, incoming: string | undefined): string {
  const next = incoming?.trim();
  if (!next || next === MASKED_SECRET) return current;
  return next;
}

export function saveBillingSettings(updates: Partial<BillingSettings>): BillingSettings {
  if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
  }
  const current = getBillingSettings();
  const merged: BillingSettings = {
    stripeSecretKey: keepSecret(current.stripeSecretKey, updates.stripeSecretKey),
    stripeWebhookSecret: keepSecret(current.stripeWebhookSecret, updates.stripeWebhookSecret),
    stripePublishableKey:
      updates.stripePublishableKey?.trim() ?? current.stripePublishableKey,
    paypalClientId: updates.paypalClientId?.trim() ?? current.paypalClientId,
    paypalClientSecret: keepSecret(current.paypalClientSecret, updates.paypalClientSecret),
    paypalWebhookId: updates.paypalWebhookId?.trim() ?? current.paypalWebhookId,
    paypalSandbox: updates.paypalSandbox ?? current.paypalSandbox,
  };
  writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

export function getStripeSecretKey(): string {
  return getBillingSettings().stripeSecretKey.trim();
}

export function getStripeWebhookSecret(): string {
  return getBillingSettings().stripeWebhookSecret.trim();
}

export function isStripeConfigured(): boolean {
  const key = getStripeSecretKey();
  return key.startsWith("sk_");
}

export function isPayPalConfigured(): boolean {
  const s = getBillingSettings();
  return Boolean(s.paypalClientId && s.paypalClientSecret);
}

export type BillingSettingsAdminView = BillingSettings & {
  stripeConfigured: boolean;
  stripeSecretSet: boolean;
  stripeWebhookSet: boolean;
  paypalConfigured: boolean;
  paypalSecretSet: boolean;
};

/** Admin API — mask secrets before sending to the browser. */
export function billingSettingsForAdmin(): BillingSettingsAdminView {
  const s = getBillingSettings();
  return {
    ...s,
    stripeSecretKey: s.stripeSecretKey ? MASKED_SECRET : "",
    stripeWebhookSecret: s.stripeWebhookSecret ? MASKED_SECRET : "",
    paypalClientSecret: s.paypalClientSecret ? MASKED_SECRET : "",
    stripeConfigured: isStripeConfigured(),
    stripeSecretSet: Boolean(s.stripeSecretKey),
    stripeWebhookSet: Boolean(s.stripeWebhookSecret),
    paypalConfigured: isPayPalConfigured(),
    paypalSecretSet: Boolean(s.paypalClientSecret),
  };
}
