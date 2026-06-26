import { pageUrl } from "@/lib/seo";
import { site } from "@/lib/site";

type WebPageJsonLdProps = {
  path: string;
  name: string;
  description: string;
  about?: string;
};

export function WebPageJsonLd({ path, name, description, about }: WebPageJsonLdProps) {
  const url = pageUrl(path);

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url,
    name,
    description,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      name: site.name,
      url: site.url,
    },
    ...(about
      ? { about: { "@type": "Thing", name: about } }
      : {}),
    potentialAction: {
      "@type": "ReadAction",
      target: url,
    },
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
    </>
  );
}
