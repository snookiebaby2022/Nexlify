import type { LpGeoContent } from "@/lib/geo";

const SHARED_FAQ = [
  {
    question: "Does Nexlify host or stream TV channels?",
    answer:
      "No. Nexlify is management software only. Licensed operators run the platform on their own VPS and supply their own content and billing.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. Nexlify offers a 7-day free trial with no credit card required. Register at nexlify.live/register to start.",
  },
] as const;

export const LP_GEO_CONTENT: Record<string, LpGeoContent> = {
  "/lp/cut-the-cord-streaming": {
    definition:
      "Nexlify is a cut-the-cord streaming management platform — operator software that lets licensed businesses run a live TV streaming service on their own VPS with WHMCS billing, Anti-Freeze playback, and HD streaming player app compatibility.",
    datePublished: "2026-06-01T00:00:00Z",
    dateModified: "2026-06-18T00:00:00Z",
    faq: [
      {
        question: "What is cut the cord streaming software?",
        answer:
          "Cut the cord streaming software is a platform operators use to deliver live TV and on-demand entertainment to subscribers who have left traditional cable. Nexlify provides the back-office stack — billing, lines, resellers, and player URLs — on your own server.",
      },
      {
        question: "Can subscribers watch live sports online with Nexlify?",
        answer:
          "Nexlify includes Anti-Freeze and fast channel zapping so operators can deliver smooth live sports playback. Operators must supply licensed sports feeds; Nexlify does not host content.",
      },
      ...SHARED_FAQ,
    ],
  },
  "/lp/live-tv-streaming-platform": {
    definition:
      "Nexlify is a live TV streaming service platform — management software for operators building premium digital entertainment businesses with HD streaming player app support, sports-grade playback, and white-label branding on their own infrastructure.",
    datePublished: "2026-06-01T00:00:00Z",
    dateModified: "2026-06-18T00:00:00Z",
    faq: [
      {
        question: "What is a live TV streaming service platform?",
        answer:
          "A live TV streaming service platform is software that lets operators manage subscribers, channels, billing, and player access for a streaming business. Nexlify is that back-office layer — not a consumer TV app.",
      },
      {
        question: "Which HD streaming player apps work with Nexlify?",
        answer:
          "Nexlify outputs Xtream-compatible player URLs used by common IPTV and STB apps. Operators configure bouquets and lines; subscribers use their preferred compatible player.",
      },
      ...SHARED_FAQ,
    ],
  },
  "/lp/reseller-panel": {
    definition:
      "Nexlify is an IPTV reseller panel — management software operators use to run subscriber lines, sub-resellers, WHMCS billing, and automated license provisioning on their own VPS worldwide.",
    datePublished: "2026-03-01T00:00:00Z",
    dateModified: "2026-06-18T00:00:00Z",
    faq: [
      {
        question: "What is an IPTV reseller panel?",
        answer:
          "An IPTV reseller panel is back-office software for creating and managing subscriber lines, reseller credits, and billing. Nexlify automates provisioning through WHMCS and Stripe.",
      },
      {
        question: "How fast can I deploy Nexlify?",
        answer:
          "Most operators run the one-click install script on Ubuntu or Debian and are live within minutes. A full sandbox demo is available before purchase.",
      },
      ...SHARED_FAQ,
    ],
  },
  "/lp/reseller-panel-uk": {
    definition:
      "Nexlify is a UK IPTV reseller panel — GBP-billed management software for British and EU operators who run lines, sub-resellers, and WHMCS automation on their own VPS.",
    datePublished: "2026-03-01T00:00:00Z",
    dateModified: "2026-06-18T00:00:00Z",
    faq: [
      {
        question: "Does Nexlify support GBP checkout for UK resellers?",
        answer:
          "Yes. Nexlify supports GBP and USD checkout via WHMCS and Stripe, with instant digital license delivery.",
      },
      {
        question: "Can I host on a UK VPS?",
        answer:
          "Yes. Deploy on any Ubuntu or Debian VPS — including London or Manchester regions — using the one-click installer.",
      },
      ...SHARED_FAQ,
    ],
  },
  "/lp/whmcs-iptv": {
    definition:
      "Nexlify is a WHMCS IPTV module paired with panel licenses — software that auto-creates, renews, suspends, and revokes IPTV management keys when customers pay through your WHMCS cart.",
    datePublished: "2026-03-01T00:00:00Z",
    dateModified: "2026-06-18T00:00:00Z",
    faq: [
      {
        question: "What does the WHMCS IPTV module do?",
        answer:
          "It connects your WHMCS products to Nexlify licenses. On order, renewal, suspension, or termination, WHMCS events sync automatically — no manual CSV license management.",
      },
      {
        question: "Where is WHMCS setup documented?",
        answer:
          "Full setup steps are at nexlify.live/docs/whmcs with product configuration examples for GBP and USD.",
      },
      ...SHARED_FAQ,
    ],
  },
};

export function getLpGeoContent(path: string): LpGeoContent | null {
  return LP_GEO_CONTENT[path] ?? null;
}

export function generateLpMarkdown(options: {
  path: string;
  title: string;
  definition: string;
  summary: string;
  bullets: string[];
  geo: LpGeoContent;
}): string {
  const url = `https://nexlify.live${options.path}`;
  const lines = [
    `# ${options.title}`,
    "",
    options.geo.definition,
    "",
    `> ${options.summary}`,
    "",
    `**URL:** ${url}`,
    `**Author:** Nexlify Product Team`,
    `**Published:** ${options.geo.datePublished.slice(0, 10)}`,
    `**Updated:** ${options.geo.dateModified.slice(0, 10)}`,
    "",
    "## Highlights",
    "",
    ...options.bullets.map((b) => `- ${b}`),
    "",
    "## FAQ",
    "",
    ...options.geo.faq.flatMap((item) => [
      `### ${item.question}`,
      "",
      item.answer,
      "",
    ]),
    "",
    "## Links",
    "",
    `- [Start free trial](https://nexlify.live/register?trial=1)`,
    `- [Live demo](https://panel.demo.nexlify.live/)`,
    `- [Pricing](https://nexlify.live/pricing)`,
    "",
  ];
  return lines.join("\n");
}
