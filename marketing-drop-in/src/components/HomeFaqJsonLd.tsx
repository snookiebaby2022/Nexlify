import { pageUrl } from "@/lib/seo";

const FAQ_ITEMS = [
  {
    question: "What is an IPTV reseller panel?",
    answer:
      "An IPTV reseller panel is back-office software that lets operators create, manage, and bill subscribers for IPTV lines, with automation for renewals, suspensions, and reseller hierarchies.",
  },
  {
    question: "Does Nexlify work with WHMCS?",
    answer:
      "Yes — the WHMCS IPTV module provisions licenses automatically on order, and syncs renewals, suspensions, and terminations in real time.",
  },
  {
    question: "Can I try Nexlify before buying?",
    answer:
      "Yes. Open the live demo at panel.demo.nexlify.live or start a 7-day free trial — no card required.",
  },
  {
    question: "Do you support GBP and USD?",
    answer:
      "Yes. Customers worldwide can checkout in GBP or USD via Stripe or WHMCS.",
  },
] as const;

export function HomeFaqJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: pageUrl("/"),
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
