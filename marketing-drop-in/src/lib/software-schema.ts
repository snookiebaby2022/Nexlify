import { site } from "@/lib/site";

export type SchemaOffer = {
  name: string;
  price: string;
  priceCurrency: "GBP" | "USD";
  url?: string;
};

const DEFAULT_OFFERS: SchemaOffer[] = [
  { name: "Starter", price: "50.00", priceCurrency: "GBP" },
  { name: "Main", price: "150.00", priceCurrency: "GBP" },
  { name: "Top Tier", price: "350.00", priceCurrency: "GBP" },
];

export function buildSoftwareApplicationSchema(options?: {
  name?: string;
  description?: string;
  url?: string;
  offers?: SchemaOffer[];
}) {
  const url = options?.url ?? site.url;
  const offers = (options?.offers ?? DEFAULT_OFFERS).map((offer) => ({
    "@type": "Offer" as const,
    name: offer.name,
    price: offer.price,
    priceCurrency: offer.priceCurrency,
    url: offer.url ?? `${site.url}/pricing`,
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization" as const, name: site.name },
  }));

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: options?.name ?? "Nexlify IPTV Panel",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "IPTV management software",
    operatingSystem: "Linux (Ubuntu, Debian)",
    url,
    description:
      options?.description ??
      "IPTV reseller panel with WHMCS IPTV module automation, anti-freeze playback, and sub-second zapping for operators worldwide.",
    offers,
    featureList: [
      "WHMCS IPTV module",
      "IPTV reseller panel",
      "Reseller hierarchy and credits",
      "Anti-freeze streaming",
      "Panel migration from XUI.one and 1-stream",
    ],
    provider: {
      "@type": "Organization",
      name: site.name,
      url: site.url,
    },
  };
}

export function buildProductSchema(options?: {
  name?: string;
  description?: string;
  url?: string;
  offers?: SchemaOffer[];
}) {
  const url = options?.url ?? `${site.url}/pricing`;
  const offers = (options?.offers ?? DEFAULT_OFFERS).map((offer) => ({
    "@type": "Offer" as const,
    name: offer.name,
    price: offer.price,
    priceCurrency: offer.priceCurrency,
    url: offer.url ?? url,
    availability: "https://schema.org/InStock",
  }));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: options?.name ?? `${site.name} IPTV Panel License`,
    description:
      options?.description ??
      "IPTV reseller panel license with WHMCS IPTV module and full IPTV management software stack.",
    brand: { "@type": "Brand", name: site.name },
    url,
    areaServed: "Worldwide",
    category: "IPTV management software",
    offers,
  };
}
