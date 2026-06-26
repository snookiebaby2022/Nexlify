import type { NextRequest } from "next/server";

/** Common crawlers, scanners, and automation UAs (panel should not expose admin to these). */
const BOT_UA_RE =
  /bot\b|crawler|spider|scraper|curl\/|wget\/|python-requests|httpx\/|aiohttp|go-http|java\/|libwww|scrapy|headless|phantomjs|selenium|puppeteer|playwright|googlebot|bingbot|yandex|baidu|duckduck|slurp|facebookexternal|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|discordbot|telegrambot|whatsapp|ahrefs|semrush|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|anthropic|ia_archiver|archive\.org|nessus|nikto|acunetix|sqlmap|masscan|zgrab/i;

const SCANNER_HEADERS = ["x-scan", "x-middleware-subrequest"];

export function isLikelyBot(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua.trim()) return true;
  if (BOT_UA_RE.test(ua)) return true;
  for (const h of SCANNER_HEADERS) {
    if (req.headers.get(h)) return true;
  }
  const accept = req.headers.get("accept") ?? "";
  if (accept === "*/*" && !ua.includes("Mozilla")) return true;
  return false;
}

export function stealthResponseHeaders(): Record<string, string> {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "interest-cohort=()",
    "Cache-Control": "no-store, private",
  };
}

/** Plain 404 — no panel branding for bots. */
export function botBlockedBody(): string {
  return "<!DOCTYPE html><html><head><title>404</title></head><body><h1>404 Not Found</h1></body></html>";
}

export function shouldStealthPath(pathname: string): boolean {
  if (pathname.startsWith("/api/agent")) return false;
  if (pathname.startsWith("/api/cron")) return false;
  if (pathname.startsWith("/api/health")) return false;
  if (pathname.startsWith("/player_api")) return false;
  if (pathname.startsWith("/get.php")) return false;
  if (pathname.startsWith("/live")) return false;
  if (pathname.startsWith("/stalker_portal")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname === "/robots.txt") return false;
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/reseller") ||
    pathname.startsWith("/login") ||
    pathname === "/"
  );
}
