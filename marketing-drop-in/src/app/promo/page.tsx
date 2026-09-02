import { PromoLanding } from "@/components/promo-landing";
import { promoOpenGraphDescription, promoPageDescription } from "@/lib/marketing-copy";

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

export function generateMetadata() {
  const description = promoPageDescription();
  return {
    title: "Nexlify — Stream management, built for operators",
    description,
    openGraph: {
      title: "Nexlify — Built for operators",
      description: promoOpenGraphDescription(),
      url: "https://nexlify.live/promo",
    },
  };
}

export default async function PromoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const utm = pickUtm(params);

  return <PromoLanding utm={utm} />;
}
