export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://nexlify.live";
export const LICENSE_URL = SITE_URL;
export const LICENSE_PRICING_URL = `${SITE_URL}/pricing`;
export const DEMO_URL =
  process.env.NEXT_PUBLIC_DEMO_URL?.replace(/\/$/, "") || "https://panel.nexlify.live";

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export function pickUtm(input: Record<string, string | string[] | undefined>): UtmParams {
  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    const raw = input[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value?.trim()) out[key] = value.trim();
  }
  return out;
}

export function appendUtm(base: string, utm: UtmParams, placement?: string): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(utm)) {
    if (v) url.searchParams.set(k, v);
  }
  if (placement && !url.searchParams.has("utm_content")) {
    url.searchParams.set("utm_content", placement);
  }
  return url.toString();
}

export function promoUrl(utm: UtmParams): string {
  return appendUtm(`${SITE_URL}/promo`, utm);
}

export function tiktokPromoUrl(utm: UtmParams): string {
  return appendUtm(`${SITE_URL}/promo/tiktok`, utm);
}

export const CAMPAIGNS = [
  {
    id: "tiktok-bio",
    label: "TikTok bio",
    description: "Video promo page — best for link-in-bio.",
    href: (utm: UtmParams) => tiktokPromoUrl({ ...utm, utm_source: "tiktok", utm_medium: "bio", utm_campaign: "operators" }),
  },
  {
    id: "tiktok-video",
    label: "TikTok video description",
    description: "Same promo video page — use in captions and comments.",
    href: (utm: UtmParams) => tiktokPromoUrl({ ...utm, utm_source: "tiktok", utm_medium: "video", utm_campaign: "operators" }),
  },
  {
    id: "promo-landing",
    label: "Text landing page",
    description: "Mobile landing with license + demo buttons (no video).",
    href: (utm: UtmParams) => promoUrl({ ...utm, utm_source: "tiktok", utm_medium: "landing", utm_campaign: "operators" }),
  },
  {
    id: "short-license",
    label: "Short link → pricing",
    description: "Skip landing — straight to pricing with UTMs.",
    href: (utm: UtmParams) => appendUtm(`${SITE_URL}/go/license`, { ...utm, utm_source: "nexlify", utm_medium: "short", utm_campaign: "pricing" }),
  },
  {
    id: "short-demo",
    label: "Short link → demo",
    description: "Send operators directly to the live panel login.",
    href: (utm: UtmParams) => appendUtm(`${SITE_URL}/go/demo`, { ...utm, utm_source: "nexlify", utm_medium: "short", utm_campaign: "demo" }),
  },
  {
    id: "lp-reseller",
    label: "Global reseller LP",
    description: "Worldwide IPTV reseller panel landing — ads and paid campaigns.",
    href: (utm: UtmParams) =>
      appendUtm(`${SITE_URL}/lp/reseller-panel`, {
        ...utm,
        utm_source: "ads",
        utm_medium: "lp",
        utm_campaign: "global_reseller",
      }),
  },
  {
    id: "lp-live-tv",
    label: "Live TV streaming LP (policy-safe)",
    description: "Entertainment keywords — Google/Meta ads without IPTV-reseller flags.",
    href: (utm: UtmParams) =>
      appendUtm(`${SITE_URL}/lp/live-tv-streaming-platform`, {
        ...utm,
        utm_source: "ads",
        utm_medium: "lp",
        utm_campaign: "live_tv_streaming",
      }),
  },
  {
    id: "lp-cut-cord",
    label: "Cut the cord streaming LP",
    description: "Cord-cutting & premium entertainment positioning for paid traffic.",
    href: (utm: UtmParams) =>
      appendUtm(`${SITE_URL}/lp/cut-the-cord-streaming`, {
        ...utm,
        utm_source: "ads",
        utm_medium: "lp",
        utm_campaign: "cut_the_cord",
      }),
  },
  {
    id: "discord",
    label: "Discord / community",
    description: "Text landing tuned for group posts and DMs.",
    href: (utm: UtmParams) => promoUrl({ ...utm, utm_source: "discord", utm_medium: "community", utm_campaign: "operators" }),
  },
] as const;

export function campaignLink(id: (typeof CAMPAIGNS)[number]["id"], extraUtm: UtmParams = {}): string {
  const campaign = CAMPAIGNS.find((c) => c.id === id);
  if (!campaign) return SITE_URL;
  return campaign.href(extraUtm);
}
