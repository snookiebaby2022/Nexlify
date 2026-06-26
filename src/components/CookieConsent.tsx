"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const COOKIE_CONSENT_KEY = "nexlify_cookie_consent";

type CookieConsentProps = {
  onAccept?: () => void;
};

export function CookieConsent({ onAccept }: CookieConsentProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(COOKIE_CONSENT_KEY)) {
      onAccept?.();
      return;
    }
    setVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  function accept() {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setVisible(false);
    window.dispatchEvent(new Event("nexlify-cookie-consent"));
    onAccept?.();
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-[90] border-t border-white/10 bg-[#0c0818]/95 p-4 backdrop-blur-md md:p-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm leading-relaxed text-slate-300">
          We use cookies and analytics (Google Analytics, Umami) to improve nexlify.live and measure
          campaigns. Visitors worldwide can accept or read our{" "}
          <Link href="/privacy" className="text-violet-400 underline hover:text-violet-300">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={accept}
            className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
