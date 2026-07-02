import { PromoLanding } from "@/components/promo-landing";

type SearchParams = Record<string, string | string[] | undefined>;

function pickUtm(params: SearchParams) {
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
  const utm: Record<string, string> = {};
  for (const key of keys) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) utm[key] = value;
  }
  return utm;
}

export const metadata = {
  title: "Nexlify — Stream management, built for operators",
  description:
    "Modern self-hosted IPTV panel. PostgreSQL-native, anti-freeze, reseller tree, WHMCS-ready. Try the live demo or get your license.",
  openGraph: {
    title: "Nexlify — Built for operators",
    description: "Upgrade from XUI or 1-stream. Try the free demo.",
    url: "https://nexlify.live/promo",
  },
};

export default async function PromoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const utm = pickUtm(params);

  return <PromoLanding utm={utm} />;
}
