"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CookieConsent } from "@/components/CookieConsent";

function isLivestreamPath(pathname: string): boolean {
  return pathname === "/livestream" || pathname.startsWith("/livestream/");
}

type MarketingOverlaysProps = {
  isLoggedIn: boolean;
};

/** Cookie consent — hidden on /livestream so only the player shows. */
export function MarketingOverlays({ isLoggedIn: _isLoggedIn }: MarketingOverlaysProps) {
  const pathname = usePathname() ?? "";

  if (isLivestreamPath(pathname)) {
    return null;
  }

  return <CookieConsent />;
}

/** Skip marketing analytics scripts on bare livestream page. */
export function LivestreamAnalyticsGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (isLivestreamPath(pathname)) {
    return null;
  }
  return <>{children}</>;
}
