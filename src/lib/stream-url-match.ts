/**
 * Normalize stream URLs so M3U sync can match the same channel across
 * default-port drift (:443 / :80) and Xtream path variants
 * (/user/pass/id vs /live/user/pass/id).
 */

const SKIP_FIRST_SEGMENTS = new Set([
  "movie",
  "series",
  "images",
  "player_api.php",
  "get.php",
  "panel_api.php",
  "xmltv.php",
  "timeshift",
  "streaming",
]);

function stripDefaultPort(host: string, port: string, protocol: string): string {
  if (!port) return host;
  if (protocol === "https:" && port === "443") return host;
  if (protocol === "http:" && port === "80") return host;
  return `${host}:${port}`;
}

/** Canonical path for Xtream-style live / VOD URLs. */
export function canonicalizeStreamPath(pathname: string): string {
  let path = pathname.replace(/\/+$/, "") || "/";

  const liveFull = path.match(/^\/live\/([^/]+)\/([^/]+)\/(\d+)(?:\.[A-Za-z0-9]+)?$/i);
  if (liveFull) {
    return `/${liveFull[1]}/${liveFull[2]}/${liveFull[3]}`;
  }

  const movie = path.match(/^\/movie\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (movie) {
    return `/movie/${movie[1]}/${movie[2]}/${movie[3]}`;
  }

  const series = path.match(/^\/series\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (series) {
    return `/series/${series[1]}/${series[2]}/${series[3]}`;
  }

  const shortLive = path.match(/^\/([^/]+)\/([^/]+)\/(\d+)(?:\.[A-Za-z0-9]+)?$/i);
  if (shortLive && !SKIP_FIRST_SEGMENTS.has(shortLive[1].toLowerCase())) {
    return `/${shortLive[1]}/${shortLive[2]}/${shortLive[3]}`;
  }

  return path;
}

/**
 * Stable match key (host + canonical path). Ignores default ports and
 * http/https so playlist + DB variants collide.
 */
export function normalizeStreamMatchKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const protocol = u.protocol.toLowerCase() === "http:" ? "http:" : "https:";
    const host = u.hostname.toLowerCase();
    const hostPort = stripDefaultPort(host, u.port, protocol);
    const path = canonicalizeStreamPath(u.pathname);
    return `${hostPort}${path}`.toLowerCase();
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^(https?):\/\/([^/:]+):(?:443|80)(?=\/)/i, "$1://$2")
      .replace(/\/live\/([^/]+\/[^/]+\/\d+)(?:\.[a-z0-9]+)?$/i, "/$1");
  }
}

/** Hostnames referenced by a playlist (for scoped DB lookups). */
export function streamUrlHosts(urls: string[]): string[] {
  const hosts = new Set<string>();
  for (const raw of urls) {
    try {
      const host = new URL(raw.trim()).hostname.toLowerCase();
      if (host) hosts.add(host);
    } catch {
      /* ignore */
    }
  }
  return [...hosts];
}
