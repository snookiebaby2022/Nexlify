import { FACEBOOK_URL, TELEGRAM_CHANNEL_URL, TELEGRAM_URL } from "@/lib/marketing-constants";

export type FaqLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  links?: FaqLink[];
};

export type FaqCategory = {
  id: string;
  title: string;
  description?: string;
  items: FaqItem[];
};

export const HELP_QUICK_LINKS: FaqLink[] = [
  { label: "One-click panel installer", href: "/install" },
  { label: "System requirements", href: "/requirements" },
  { label: "Panel updates", href: "/updates" },
  { label: "Create a support ticket", href: "/support" },
  { label: "Panel demo", href: "/demo" },
  { label: "Pricing & plans", href: "/pricing" },
  { label: "WHMCS setup guide", href: "/docs/whmcs" },
  { label: "My licenses", href: "/dashboard" },
  { label: "Terms & conditions", href: "/terms" },
  { label: "Refund policy", href: "/refund-policy" },
  { label: "Security & encryption", href: "/help#security" },
  { label: "Telegram channel", href: TELEGRAM_CHANNEL_URL, external: true },
  { label: "Facebook", href: FACEBOOK_URL, external: true },
];

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "New to Nexlify? Start here.",
    items: [
      {
        id: "what-is-nexlify",
        question: "What is Nexlify?",
        answer:
          "Nexlify sells IPTV panel software licenses and optional plugins. We provide billing, license keys, and documentation — we do not host, stream, or distribute any copyrighted content, sports feeds, channels, or other TV content. You run the panel on your own server and connect it to your WHMCS billing.",
        links: [
          { label: "Try the live panel demo", href: "/demo" },
          { label: "View pricing", href: "/pricing" },
        ],
      },
      {
        id: "how-to-buy",
        question: "How do I purchase a panel license?",
        answer:
          "Choose a plan on our pricing page and complete checkout through WHMCS. After payment, a license key is issued automatically and linked to your account. You can copy it from your dashboard and activate it in your IPTV panel.",
        links: [
          { label: "Pricing", href: "/pricing" },
          { label: "Register an account", href: "/register" },
          { label: "WHMCS integration guide", href: "/docs/whmcs" },
        ],
      },
      {
        id: "try-before-buy",
        question: "Can I try the panel before buying?",
        answer:
          "Yes. The demo panel is a full sandbox at panel.demo.nexlify.live — explore streams, lines, resellers, and settings. Live playback and permanent changes are disabled in demo mode.",
        links: [
          { label: "Open panel demo", href: "/demo" },
          {
            label: "panel.demo.nexlify.live",
            href: "https://panel.demo.nexlify.live/",
            external: true,
          },
        ],
      },
      {
        id: "server-requirements",
        question: "What do I need to run the panel?",
        answer:
          "A Linux VPS (Ubuntu 22.04+ recommended) with Node.js, PM2, nginx, PostgreSQL, and Redis. Use our one-line installer on a fresh Ubuntu/Debian server — it installs dependencies, builds the panel, configures PM2 and nginx, and optionally issues Let's Encrypt SSL.",
        links: [
          { label: "One-click installer", href: "/install" },
          {
            label: "Install script (raw)",
            href: "https://nexlify.live/install/panel.sh",
            external: true,
          },
          { label: "Contact support for setup help", href: "/support" },
        ],
      },
    ],
  },
  {
    id: "licensing",
    title: "Licenses & activation",
    items: [
      {
        id: "find-license",
        question: "Where is my license key?",
        answer:
          "Sign in and open My licenses on your dashboard. Keys issued by WHMCS or manual admin issue appear there with status, expiry, and plan limits. Copy the key and paste it into your panel under License activation.",
        links: [{ label: "My licenses", href: "/dashboard" }],
      },
      {
        id: "activate-panel",
        question: "How do I activate the panel with my key?",
        answer:
          "In your IPTV panel admin, go to License (or Settings → License), paste your XSTR-… key, and save. The panel validates the key against Nexlify and binds it to your server. One key per panel installation unless your plan allows otherwise.",
        links: [
          { label: "Panel install guide", href: "/install" },
          { label: "My licenses", href: "/dashboard" },
        ],
      },
      {
        id: "license-expired",
        question: "My license expired or shows suspended — what now?",
        answer:
          "Renew or pay the outstanding WHMCS invoice for the linked service. WHMCS automation extends expiry on renewal and re-enables suspended keys. If billing is correct but the panel still fails, open a ticket with your key and domain.",
        links: [
          { label: "My licenses", href: "/dashboard" },
          { label: "Open a support ticket", href: "/support" },
        ],
      },
      {
        id: "transfer-license",
        question: "Can I move a license to a new server?",
        answer:
          "License keys can bind to a machine ID on first activation. Contact support with your key and the reason for the move (new VPS, reinstall, etc.) — we can reset the binding when appropriate.",
        links: [{ label: "Create a support ticket", href: "/support" }],
      },
    ],
  },
  {
    id: "whmcs",
    title: "WHMCS & billing",
    items: [
      {
        id: "whmcs-automation",
        question: "How does WHMCS automation work?",
        answer:
          "Install our StreamForge / Nexlify server module in WHMCS. When a customer pays for a panel product, WHMCS calls our API to create, renew, suspend, or revoke the matching license key automatically.",
        links: [{ label: "WHMCS setup documentation", href: "/docs/whmcs" }],
      },
      {
        id: "whmcs-products",
        question: "Which WHMCS product IDs map to plans?",
        answer:
          "Product IDs 1–3 in WHMCS map to Starter, Main, and Top Tier panel plans (see the WHMCS docs for the current mapping). Addon products for plugins use separate product IDs configured in the module.",
        links: [{ label: "WHMCS docs", href: "/docs/whmcs" }],
      },
      {
        id: "refunds",
        question: "What is your refund policy?",
        answer:
          "All sales are final. Review your order before checkout. If you have a billing dispute or technical issue, contact us via support ticket and we will help resolve it.",
        links: [{ label: "Refund policy", href: "/refund-policy" }],
      },
    ],
  },
  {
    id: "panel",
    title: "IPTV panel features",
    items: [
      {
        id: "migration",
        question: "Can I migrate from XUI.one or 1-stream?",
        answer:
          "Yes. In the panel admin go to Import → Panel migration for XUI, 1-stream, Xtream UI, and Midnight Streamers. For Nexlify-to-Nexlify moves use Panel transfer (export/import JSON). Always run Preview before importing.",
        links: [
          {
            label: "Panel demo (try migration UI)",
            href: "https://panel.demo.nexlify.live/admin/import/migrate",
            external: true,
          },
        ],
      },
      {
        id: "plugins",
        question: "What plugins and addons are available?",
        answer:
          "Optional addons include Plex, Emby, Jellyfin, Spotify, Apple Music, Deezer, YouTube Music, statistics, and proxy integrations. Purchase through WHMCS; the panel checks entitlements via the addon API.",
        links: [{ label: "Plugin pricing", href: "/pricing#plugins" }],
      },
      {
        id: "resellers",
        question: "Does the panel support resellers and sub-resellers?",
        answer:
          "Yes. The panel includes a full reseller hierarchy with credits, bouquet access, line creation, and sub-reseller accounts. Demo credentials are on the demo page.",
        links: [{ label: "Panel demo", href: "/demo" }],
      },
    ],
  },
  {
    id: "security",
    title: "Security & encryption",
    description: "How Nexlify protects your website, panel, and data.",
    items: [
      {
        id: "encryption-transit",
        question: "Is traffic encrypted?",
        answer:
          "Yes. nexlify.live, panel.demo.nexlify.live, panel.nexlify.live, and billing.nexlify.live are served over HTTPS (TLS 1.2+) with Let's Encrypt certificates. Use Cloudflare Full (strict) mode for end-to-end encryption through the CDN.",
        links: [{ label: "Cloudflare SSL guide", href: "/help#security" }],
      },
      {
        id: "encryption-rest",
        question: "Are files and databases encrypted at rest?",
        answer:
          "Passwords are hashed (bcrypt). License keys in the panel database are encrypted with AES-256-GCM. Session cookies use signed JWTs. Application source files on your VPS are not encrypted by default — enable provider disk encryption or LUKS on your server for full-disk protection. PostgreSQL data directories are locked to the postgres user (chmod 700).",
      },
      {
        id: "secrets",
        question: "How should I protect secrets (.env, SSH keys)?",
        answer:
          "Never commit .env files or .pem license private keys to git. Our deploy scripts automatically set chmod 600 on .env files and chmod 700 on data directories after each update. Rotate JWT_SECRET and ENCRYPTION_AT_REST_KEY if you suspect a breach.",
      },
      {
        id: "cloudflare-waf",
        question: "What Cloudflare settings do you recommend?",
        answer:
          "SSL/TLS: Full (strict). Enable WAF managed rules (free tier) and bot fight mode for public hosts. Purge cache after deploys. panel.demo.nexlify.live often needs DNS-only (grey cloud) unless you have Advanced Certificate Manager for double subdomains.",
        links: [
          {
            label: "Telegram channel",
            href: TELEGRAM_CHANNEL_URL,
            external: true,
          },
        ],
      },
    ],
  },
  {
    id: "support",
    title: "Help & contact",
    items: [
      {
        id: "open-ticket",
        question: "How do I contact support?",
        answer:
          "Create a support ticket on this site (sign in required). Include your license key, panel URL, and steps to reproduce the issue. We typically respond within one business day.",
        links: [
          { label: "Create a ticket", href: "/support" },
          { label: "Sign in", href: "/login" },
        ],
      },
      {
        id: "telegram",
        question: "Is there a Telegram channel, Facebook page, or community?",
        answer:
          "Follow our Telegram channel and Facebook page for product updates and announcements. Join the Telegram community group for discussion. For account-specific or license issues, use support tickets so we can track your case.",
        links: [
          {
            label: "Telegram channel",
            href: TELEGRAM_CHANNEL_URL,
            external: true,
          },
          {
            label: "Facebook",
            href: FACEBOOK_URL,
            external: true,
          },
          {
            label: "Telegram community",
            href: TELEGRAM_URL,
            external: true,
          },
        ],
      },
      {
        id: "status",
        question: "The website or panel is down — what should I check?",
        answer:
          "Confirm your VPS is online (SSH), PM2 processes are running (nexlify, nexlify-web), and nginx is serving HTTPS. Restart with pm2 restart all after deploys. If nexlify.live is unreachable, check our status or open a ticket.",
        links: [{ label: "Open a support ticket", href: "/support" }],
      },
    ],
  },
];
