import { FREE_PERIOD_END_LABEL, isFreePeriod } from "@/lib/marketing-coupon";
import { PAID_PRICE_GBP_CENTS } from "@/lib/plans";

export const PAID_PRICE_LABEL = `£${PAID_PRICE_GBP_CENTS / 100}/month`;
export const CHECKOUT_TAGLINE = "Stripe & PayPal checkout · GBP default · USD available";
export const LICENSE_DELIVERY_LINE =
  "Automatic license delivery — your key appears on the dashboard and by email after payment.";

export function pricingHeroEyebrow(): string {
  return isFreePeriod() ? `Free until ${FREE_PERIOD_END_LABEL}` : CHECKOUT_TAGLINE;
}

export function pricingHeroTitle(): string {
  return isFreePeriod()
    ? "All licenses free — IPTV reseller panel for operators worldwide"
    : "IPTV reseller panel — simple pricing for operators worldwide";
}

export function pricingHeroSubtitle(): string {
  if (isFreePeriod()) {
    return `Nexlify IPTV management software is free for all operators until ${FREE_PERIOD_END_LABEL}. Every license includes instant digital delivery and full panel access — no credit card required during the free period.`;
  }
  return `Start with a 7-day free trial, then one simple Nexlify License at ${PAID_PRICE_LABEL}. ${CHECKOUT_TAGLINE}. Every license includes unlimited servers, all plugins, and instant key delivery.`;
}

export function pricingHonestyNote(): string {
  return isFreePeriod()
    ? `Completely free until ${FREE_PERIOD_END_LABEL}, then ${PAID_PRICE_LABEL} — everything included. Support via tickets and Telegram.`
    : `${PAID_PRICE_LABEL} — everything included. 7-day trial available. Support via tickets and Telegram.`;
}

export function pluginPricingBlurb(): string {
  return isFreePeriod()
    ? `free until ${FREE_PERIOD_END_LABEL}, then included in the ${PAID_PRICE_LABEL} plan`
    : `included with your Nexlify License (${PAID_PRICE_LABEL})`;
}

export function paidPlanLimitNote(): string {
  return isFreePeriod()
    ? `Free until ${FREE_PERIOD_END_LABEL}, then ${PAID_PRICE_LABEL}`
    : PAID_PRICE_LABEL;
}

export function promoBadgeText(): string {
  return isFreePeriod()
    ? `All licenses free until ${FREE_PERIOD_END_LABEL}`
    : `${PAID_PRICE_LABEL} · 7-day free trial · Stripe & PayPal checkout`;
}

export function promoPageDescription(): string {
  return isFreePeriod()
    ? `Modern self-hosted IPTV panel. PostgreSQL-native, anti-freeze, reseller tree, license-ready. All licenses free until ${FREE_PERIOD_END_LABEL}.`
    : `Modern self-hosted IPTV panel. PostgreSQL-native, anti-freeze, reseller tree, license-ready. ${PAID_PRICE_LABEL} with 7-day trial · Stripe & PayPal checkout.`;
}

export function promoOpenGraphDescription(): string {
  return isFreePeriod()
    ? `All licenses free until ${FREE_PERIOD_END_LABEL}. Try the live demo.`
    : `${PAID_PRICE_LABEL} · 7-day trial · Try the live demo.`;
}
