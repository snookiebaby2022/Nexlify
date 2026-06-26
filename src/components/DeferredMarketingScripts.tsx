"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { COOKIE_CONSENT_KEY } from "@/components/CookieConsent";

const GoogleTagManagerHead = dynamic(
  () => import("@/components/GoogleTagManager").then((m) => ({ default: m.GoogleTagManagerHead })),
  { ssr: false },
);
const GoogleTagManagerNoscript = dynamic(
  () =>
    import("@/components/GoogleTagManager").then((m) => ({ default: m.GoogleTagManagerNoscript })),
  { ssr: false },
);
const GoogleAnalytics = dynamic(
  () => import("@/components/GoogleAnalytics").then((m) => ({ default: m.GoogleAnalytics })),
  { ssr: false },
);
const GoogleAnalyticsPageView = dynamic(
  () =>
    import("@/components/GoogleAnalyticsPageView").then((m) => ({
      default: m.GoogleAnalyticsPageView,
    })),
  { ssr: false },
);
const UmamiAnalytics = dynamic(
  () => import("@/components/UmamiAnalytics").then((m) => ({ default: m.UmamiAnalytics })),
  { ssr: false },
);
const AdPixels = dynamic(
  () => import("@/components/AdPixels").then((m) => ({ default: m.AdPixels })),
  { ssr: false },
);
const ConversionTracker = dynamic(
  () => import("@/components/ConversionTracker").then((m) => ({ default: m.ConversionTracker })),
  { ssr: false },
);

function hasConsent(): boolean {
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

/** Load GTM/GA/pixels after cookie consent — keeps third-party JS off the critical path. */
export function DeferredMarketingScripts() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (hasConsent()) {
      setEnabled(true);
      return;
    }

    function onConsent() {
      setEnabled(true);
    }

    window.addEventListener("nexlify-cookie-consent", onConsent);
    return () => window.removeEventListener("nexlify-cookie-consent", onConsent);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <GoogleTagManagerHead />
      <GoogleTagManagerNoscript />
      <GoogleAnalytics />
      <GoogleAnalyticsPageView />
      <UmamiAnalytics />
      <AdPixels />
      <ConversionTracker />
    </>
  );
}
