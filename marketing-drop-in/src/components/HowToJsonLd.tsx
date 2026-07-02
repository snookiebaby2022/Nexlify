import { pageUrl } from "@/lib/seo";
import { site } from "@/lib/site";

const INSTALL_STEPS = [
  {
    name: "Order a Linux VPS",
    text: "Use Ubuntu 22.04+ or Debian 12 with at least 2 vCPU and 4 GB RAM. Any worldwide datacentre works.",
  },
  {
    name: "Run the one-line installer",
    text: "SSH in as root and run: curl -fsSL https://nexlify.live/install/panel.sh?v=164 | sudo bash -s -- --domain YOUR_IP_OR_DOMAIN",
  },
  {
    name: "Sign in to the panel",
    text: "Open the login URL printed when install finishes (http://YOUR_IP/login on port 80 — no :3000). Use admin and the generated password from /root/nexlify/install-credentials.",
  },
  {
    name: "Activate your license",
    text: "In the panel go to Admin → License, paste your NXLF1 key from My licenses on nexlify.live, then continue to the dashboard.",
  },
  {
    name: "Optional: HTTPS on a domain",
    text: "Point DNS at your VPS and re-run with --email you@example.com, or run certbot after install.",
  },
];

export function HowToJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Install Nexlify IPTV panel on Ubuntu or Debian",
    description:
      "One-command installer for Nexlify IPTV management software. Install first, sign in, then activate your license in the panel.",
    url: pageUrl("/install"),
    inLanguage: ["en-GB", "en-US"],
    step: INSTALL_STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      url: `${pageUrl("/install")}#installer`,
    })),
    tool: [{ "@type": "HowToTool", name: "SSH client" }],
    supply: [
      { "@type": "HowToSupply", name: "Linux VPS" },
      { "@type": "HowToSupply", name: `${site.name} license key (added in panel after install)` },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
