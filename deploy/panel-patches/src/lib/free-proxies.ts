/** Curated public proxy samples — reliability varies; for testing / free tier only. */
export type FreeProxyEntry = {
  host: string;
  port: number;
  type: "HTTP" | "HTTPS" | "SOCKS5";
  country: string;
  countryName: string;
};

export const FREE_PROXY_DISCLAIMER =
  "Public free proxies are unstable and may log traffic. Use for EPG fetch tests only; prefer paid/residential proxies in production.";

/** Static fallback list when live API is unavailable. */
export const FREE_PROXIES_CURATED: FreeProxyEntry[] = [
  { host: "103.152.112.162", port: 80, type: "HTTP", country: "id", countryName: "Indonesia" },
  { host: "185.32.6.129", port: 8090, type: "HTTP", country: "ru", countryName: "Russia" },
  { host: "51.79.52.48", port: 3128, type: "HTTP", country: "sg", countryName: "Singapore" },
  { host: "103.127.1.130", port: 80, type: "HTTP", country: "bd", countryName: "Bangladesh" },
  { host: "47.74.152.29", port: 8888, type: "HTTP", country: "us", countryName: "United States" },
  { host: "103.149.162.195", port: 80, type: "HTTP", country: "in", countryName: "India" },
  { host: "103.216.73.43", port: 8080, type: "HTTP", country: "id", countryName: "Indonesia" },
  { host: "154.203.43.115", port: 3128, type: "HTTP", country: "us", countryName: "United States" },
  { host: "89.116.250.153", port: 80, type: "HTTP", country: "lt", countryName: "Lithuania" },
  { host: "103.155.197.133", port: 8080, type: "HTTP", country: "id", countryName: "Indonesia" },
  { host: "103.156.14.52", port: 8080, type: "HTTP", country: "id", countryName: "Indonesia" },
  { host: "47.88.3.19", port: 8080, type: "HTTP", country: "us", countryName: "United States" },
  { host: "103.152.112.145", port: 80, type: "HTTP", country: "de", countryName: "Germany" },
  { host: "51.79.52.131", port: 3128, type: "HTTP", country: "fr", countryName: "France" },
  { host: "103.127.1.130", port: 8080, type: "HTTP", country: "uk", countryName: "United Kingdom" },
];

const COUNTRY_NAMES: Record<string, string> = {
  us: "United States",
  uk: "United Kingdom",
  de: "Germany",
  fr: "France",
  ru: "Russia",
  sg: "Singapore",
  in: "India",
  id: "Indonesia",
  bd: "Bangladesh",
  lt: "Lithuania",
  br: "Brazil",
  ca: "Canada",
  nl: "Netherlands",
  pl: "Poland",
};

export function countryNameForCode(code: string): string {
  return COUNTRY_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/** Try ProxyScrape free HTTP list (no key); falls back to curated list. */
export async function fetchFreeProxiesLive(): Promise<{
  proxies: FreeProxyEntry[];
  source: "live" | "curated";
  error?: string;
}> {
  try {
    const url = "https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all&format=textplain";
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes(":"));
    const proxies: FreeProxyEntry[] = [];
    for (const line of lines.slice(0, 80)) {
      const [host, portStr] = line.split(":");
      const port = parseInt(portStr, 10);
      if (!host || !Number.isFinite(port)) continue;
      proxies.push({
        host,
        port,
        type: "HTTP",
        country: "ww",
        countryName: "Unknown",
      });
    }
    if (proxies.length > 0) {
      return { proxies, source: "live" };
    }
  } catch (e) {
    return {
      proxies: FREE_PROXIES_CURATED,
      source: "curated",
      error: e instanceof Error ? e.message : "Fetch failed",
    };
  }
  return { proxies: FREE_PROXIES_CURATED, source: "curated" };
}

export function filterFreeProxiesByCountry(
  proxies: FreeProxyEntry[],
  country: string
): FreeProxyEntry[] {
  if (!country || country === "all") return proxies;
  const c = country.toLowerCase();
  return proxies.filter((p) => p.country.toLowerCase() === c);
}
