import Stripe from "stripe";
import { getStripeSecretKey, isStripeConfigured as billingStripeConfigured } from "@/lib/billing-settings";

export { isStripeConfigured } from "@/lib/billing-settings";
export { getAppUrl } from "@/lib/app-url";

let stripeClient: Stripe | null = null;
let stripeClientKey: string | null = null;

export function resetStripeClient(): void {
  stripeClient = null;
  stripeClientKey = null;
}

export function getStripe(): Stripe {
  const key = getStripeSecretKey();
  if (!key) {
    throw new Error("Stripe is not configured — add keys in Admin → Marketing → Checkout payments");
  }
  if (!billingStripeConfigured()) {
    throw new Error("Stripe secret key is invalid — must start with sk_");
  }
  if (!stripeClient || stripeClientKey !== key) {
    stripeClient = new Stripe(key);
    stripeClientKey = key;
  }
  return stripeClient;
}
