/** GTM / GA4 dataLayer helpers — configure tags in GTM to fire on these event names. */

export type AnalyticsEvent =
  | "trial_start"
  | "demo_click"
  | "pricing_view"
  | "checkout_start"
  | "purchase"
  | "coupon_claim"
  | "newsletter_signup"
  | "lead_magnet_signup"
  | "telegram_click"
  | "facebook_click";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function trackEvent(
  event: AnalyticsEvent,
  params?: Record<string, string | number | boolean | undefined>,
) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  const payload: Record<string, unknown> = { event, ...params };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  window.dataLayer.push(payload);
}

export function trackPageConversion(pathname: string) {
  if (pathname === "/pricing" || pathname.startsWith("/pricing")) {
    trackEvent("pricing_view", { page_path: pathname });
  }
}
