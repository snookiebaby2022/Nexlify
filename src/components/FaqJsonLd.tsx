import { FAQ_CATEGORIES } from "@/lib/help-faq";
import { pageUrl } from "@/lib/seo";

export function FaqJsonLd() {
  const mainEntity = FAQ_CATEGORIES.flatMap((category) =>
    category.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  );

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: pageUrl("/help"),
    inLanguage: ["en-GB", "en-US"],
    mainEntity,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
