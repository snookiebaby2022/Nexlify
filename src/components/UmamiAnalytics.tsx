"use client";

import { useEffect } from "react";

const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL?.replace(/\/$/, "");
const demoWebsiteId = process.env.NEXT_PUBLIC_UMAMI_DEMO_WEBSITE_ID;
const ownerWebsiteId = process.env.NEXT_PUBLIC_UMAMI_OWNER_WEBSITE_ID;
const fallbackWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

function websiteIdForHost(hostname: string) {
  if (hostname.includes("demo")) {
    return demoWebsiteId ?? fallbackWebsiteId;
  }
  return ownerWebsiteId ?? fallbackWebsiteId;
}

export function UmamiAnalytics() {
  useEffect(() => {
    if (!umamiUrl || typeof window === "undefined") return;

    const websiteId = websiteIdForHost(window.location.hostname);
    if (!websiteId) return;

    const selector = `script[data-website-id="${websiteId}"][data-umami]`;
    if (document.querySelector(selector)) return;

    const script = document.createElement("script");
    script.defer = true;
    script.src = `${umamiUrl}/script.js`;
    script.setAttribute("data-website-id", websiteId);
    script.setAttribute("data-umami", "1");
    document.head.appendChild(script);
  }, []);

  return null;
}
