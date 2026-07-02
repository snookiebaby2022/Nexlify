export function normalizePanelServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    if (isMarketingSiteHost(url.hostname)) {
      throw new Error("Use your IPTV panel URL (e.g. https://panel.nexlify.live), not nexlify.live");
    }
    return url.origin;
  } catch (e) {
    if (e instanceof Error && e.message.includes("panel URL")) throw e;
    throw new Error("Invalid server URL");
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

/** Hostnames that are marketing site only — not Xtream panels. */
const MARKETING_ONLY_HOSTS = new Set(["nexlify.live", "www.nexlify.live"]);

export function isMarketingSiteHost(hostname: string): boolean {
  return MARKETING_ONLY_HOSTS.has(hostname.toLowerCase());
}

export function assertAllowedPanelUrl(raw: string): URL {
  const normalized = normalizePanelServerUrl(raw);
  if (!normalized) throw new Error("Missing server URL");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Invalid server URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Server URL must use http or https");
  }
  if (isPrivateOrLocalHost(url.hostname)) {
    throw new Error("Server URL not allowed");
  }
  if (isMarketingSiteHost(url.hostname)) {
    throw new Error("Use your IPTV panel URL (e.g. https://panel.nexlify.live), not nexlify.live");
  }
  return url;
}

function internalPanelHosts(): Set<string> {
  const raw =
    process.env.PANEL_INTERNAL_HOSTS ||
    "panel.nexlify.live,panel.demo.nexlify.live,127.0.0.1,localhost";
  return new Set(
    raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Server-side fetch origin — bypass Cloudflare when panel runs on same VPS. */
export function resolvePanelFetchOrigin(server: string): string {
  const publicUrl = assertAllowedPanelUrl(server);
  const host = publicUrl.hostname.toLowerCase();
  const mapped = internalPanelHosts();
  const internalBase = (process.env.PANEL_INTERNAL_URL || "http://127.0.0.1:13000").trim().replace(/\/$/, "");

  if (mapped.has(host)) {
    try {
      return new URL(internalBase).origin;
    } catch {
      return publicUrl.origin;
    }
  }
  return publicUrl.origin;
}

export function buildPanelPlayerApiUrl(
  server: string,
  username: string,
  password: string,
  action?: string,
  extra?: Record<string, string>
): string {
  const origin = resolvePanelFetchOrigin(server);
  const url = new URL(`${origin}/player_api.php`);
  url.searchParams.set("username", username);
  url.searchParams.set("password", password);
  if (action) url.searchParams.set("action", action);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function assertAllowedFetchUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("URL must use http or https");
  }
  if (isPrivateOrLocalHost(url.hostname)) {
    throw new Error("URL not allowed");
  }
  return url;
}

export function looksLikeHtml(text: string): boolean {
  const sample = text.trimStart().slice(0, 64).toLowerCase();
  return sample.startsWith("<!doctype") || sample.startsWith("<html");
}
