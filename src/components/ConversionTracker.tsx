"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackEvent, trackPageConversion } from "@/lib/analytics";

export function ConversionTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackPageConversion(pathname);
    if (pathname === "/checkout/success" || pathname === "/order/success") {
      trackEvent("purchase", { page_path: pathname });
    }
    if (pathname === "/register" && new URLSearchParams(window.location.search).has("trial")) {
      trackEvent("trial_start", { page_path: pathname, step: "landing" });
    }
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest("[data-track]");
      if (!el) return;
      const event = el.getAttribute("data-track") as Parameters<typeof trackEvent>[0] | null;
      if (!event) return;
      trackEvent(event, {
        label: el.getAttribute("data-track-label") ?? undefined,
        href: el.getAttribute("href") ?? undefined,
      });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
