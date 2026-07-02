import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WEBSITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://nexlify.live"
  );
}
