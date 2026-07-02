export const site = {
  name: "Nexlify",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://nexlify.live",
  domain: "nexlify.live",
  supportEmail: "support@nexlify.live",
  salesEmail: "sales@nexlify.live",
} as const;
