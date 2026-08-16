import { prisma } from "@/lib/prisma";

/** Hostnames that are protocol labels, not CDN domains. */
const PROTOCOL_LABELS = new Set([
  "http",
  "https",
  "rtmp",
  "rtmps",
  "hls",
  "ts",
  "tcp",
  "udp",
]);

/** Cloudflare-compatible HTTP(S) ports commonly used for IPTV edges. */
const CF_HTTP_PORTS = new Set([80, 8080, 8880, 2052, 2082, 2086, 2095]);
const CF_HTTPS_PORTS = new Set([443, 8443, 2053, 2083, 2087, 2096]);

export type SuggestedCdnEndpoint = {
  name: string;
  url: string;
  priority: number;
  region: string;
  source: string;
};

function looksLikeHostname(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || PROTOCOL_LABELS.has(v)) return false;
  if (v.includes("://")) return false;
  if (!v.includes(".")) return false;
  // bare IPv4 — not a Cloudflare hostname
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return false;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(v);
}

/** Pull hostnames from StreamServer.domain + comma-separated protocol leftovers (XUI migrate). */
export function extractHostnamesFromServer(server: {
  name: string;
  domain: string | null;
  protocol: string | null;
  host: string;
  port: number;
}): { hostname: string; port: number; serverName: string }[] {
  const raw: string[] = [];
  if (server.domain) raw.push(...server.domain.split(/[,;\s]+/));
  if (server.protocol) raw.push(...server.protocol.split(/[,;\s]+/));
  const out: { hostname: string; port: number; serverName: string }[] = [];
  const seen = new Set<string>();
  for (const part of raw) {
    const host = part.trim().replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0] ?? "";
    if (!looksLikeHostname(host)) continue;
    const key = host.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ hostname: host, port: server.port || 80, serverName: server.name });
  }
  return out;
}

export function urlsForCloudflareHost(hostname: string, port: number): string[] {
  const urls: string[] = [];
  // Prefer standard HTTPS first (orange-cloud needs working origin SSL or CF returns 521).
  urls.push(`https://${hostname}`);
  if (port && port !== 443 && port !== 80) {
    if (CF_HTTPS_PORTS.has(port)) urls.push(`https://${hostname}:${port}`);
    if (CF_HTTP_PORTS.has(port)) urls.push(`http://${hostname}:${port}`);
  } else {
    urls.push(`http://${hostname}`);
  }
  return [...new Set(urls)];
}

/**
 * Suggest Smart CDN rows from stream-server domains (typically Cloudflare orange-cloud).
 * Does not create rows — caller dedupes against existing endpoints.
 */
export async function suggestCloudflareCdnEndpoints(): Promise<SuggestedCdnEndpoint[]> {
  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: { name: true, domain: true, protocol: true, host: true, port: true },
    orderBy: { sortOrder: "asc" },
  });

  const existing = await prisma.cdnEndpoint.findMany({ select: { url: true } });
  const existingUrls = new Set(existing.map((e) => e.url.replace(/\/$/, "").toLowerCase()));

  const suggestions: SuggestedCdnEndpoint[] = [];
  let priority = 0;
  for (const server of servers) {
    for (const hit of extractHostnamesFromServer(server)) {
      for (const url of urlsForCloudflareHost(hit.hostname, hit.port)) {
        const key = url.replace(/\/$/, "").toLowerCase();
        if (existingUrls.has(key)) continue;
        existingUrls.add(key);
        suggestions.push({
          name: `Cloudflare — ${hit.hostname}${url.includes(":") && !url.endsWith(":443") && !url.endsWith(":80") ? ` ${new URL(url).port}` : ""}`.trim(),
          url,
          priority: priority++,
          region: "cf-global",
          source: hit.serverName,
        });
      }
    }
  }
  return suggestions;
}
