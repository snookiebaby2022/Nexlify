import { DEFAULT_DESCRIPTION } from "@/lib/seo";
import { buildSoftwareApplicationSchema } from "@/lib/software-schema";
import { site } from "@/lib/site";
import { JsonLdScript } from "@/components/JsonLdScript";

export function OrganizationJsonLd() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    email: site.supportEmail,
    description: DEFAULT_DESCRIPTION,
    areaServed: "Worldwide",
    knowsAbout: [
      "IPTV panel",
      "IPTV management software",
      "IPTV reseller software",
      "WHMCS IPTV module",
      "Xtream panel",
    ],
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    description: DEFAULT_DESCRIPTION,
    inLanguage: ["en-GB", "en-US"],
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: site.url,
    },
    potentialAction: {
      "@type": "ReadAction",
      target: `${site.url}/pricing`,
    },
  };

  const software = buildSoftwareApplicationSchema({
    url: site.url,
    description:
      "IPTV reseller panel with WHMCS automation, anti-freeze playback, and sub-second zapping. Management software for service providers worldwide.",
  });

  return (
    <>
      <JsonLdScript data={organization} />
      <JsonLdScript data={website} />
      <JsonLdScript data={software} />
    </>
  );
}
