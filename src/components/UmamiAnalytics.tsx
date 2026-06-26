import Script from "next/script";

const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL?.replace(/\/$/, "");
const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export function UmamiAnalytics() {
  if (!umamiUrl || !websiteId) return null;

  return (
    <Script
      defer
      src={`${umamiUrl}/script.js`}
      data-website-id={websiteId}
      strategy="lazyOnload"
    />
  );
}
