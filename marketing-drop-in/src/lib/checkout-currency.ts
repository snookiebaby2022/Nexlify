import { gbpToUsdCents } from "@/lib/plans";

export type CheckoutCurrency = "GBP" | "USD";
export type CheckoutPaymentMethod = "stripe" | "paypal";

export const DEFAULT_CHECKOUT_CURRENCY: CheckoutCurrency = "GBP";

export function parseCheckoutCurrency(value: unknown): CheckoutCurrency {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw === "USD" ? "USD" : "GBP";
}

export function parsePaymentMethod(value: unknown): CheckoutPaymentMethod {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "paypal" ? "paypal" : "stripe";
}

export function stripeCurrencyCode(currency: CheckoutCurrency): "gbp" | "usd" {
  return currency === "USD" ? "usd" : "gbp";
}

/** Plan prices are stored as GBP pence — convert for USD checkout. */
export function checkoutAmountCents(gbpCents: number, currency: CheckoutCurrency): number {
  return currency === "USD" ? gbpToUsdCents(gbpCents) : gbpCents;
}

export function paypalCurrencyCode(currency: CheckoutCurrency): string {
  return currency;
}

export function paypalAmountMajor(cents: number): number {
  return cents / 100;
}
