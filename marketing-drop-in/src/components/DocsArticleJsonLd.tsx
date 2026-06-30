import { pageUrl } from "@/lib/seo";
import { site } from "@/lib/site";

type DocsArticleJsonLdProps = {
  path: string;
  headline: string;
  description: string;
  articleBody: string;
  keywords: string;
  about?: string;
};

export function DocsArticleJsonLd({
  path,
  headline,
  description,
  articleBody,
  keywords,
  about = "Documentation",
}: DocsArticleJsonLdProps) {
  const url = pageUrl(path);

  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    url,
    headline,
    genre: "Documentation",
    keywords,
    description,
    articleBody,
    articleSection: "Docs",
    inLanguage: "en",
    author: { "@type": "Organization", name: site.name, url: site.url },
    publisher: { "@type": "Organization", name: site.name, url: site.url },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    potentialAction: { "@type": "ReadAction", target: url },
  };

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url,
    name: headline,
    description,
    inLanguage: "en",
    about: { "@type": "Thing", name: about },
    isPartOf: { "@type": "WebSite", name: site.name, url: site.url },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPosting) }}
      />
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
