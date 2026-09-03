export type PlexIntegrationConfig = {
  url?: string;
  host?: string;
  port?: number | string;
  protocol?: string;
  username?: string;
  password?: string;
  token?: string;
  clientIdentifier?: string;
  serverId?: string | null;
  transcodeProfile?: string;
  /** XUI direct_proxy — prefer direct play; panel still resolves upstream for movie route. */
  directStream?: boolean;
  libraryKey?: string;
  libraryTitle?: string;
  /** Selected Plex section keys. Empty means every movie/show library. */
  libraryKeys?: string[];
  /** Skip movies/shows whose titles already exist on the IPTV panel. */
  skipExistingCatalog?: boolean;
  /** Skip titles that are not English (Plex language tag, script, or genre). */
  excludeNonEnglish?: boolean;
};

/** Pull the real X-Plex-Token out of a pasted URL, query string, or labeled value. */
export function extractPlexToken(raw: string): string {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      const q = u.searchParams.get("X-Plex-Token") || u.searchParams.get("x-plex-token");
      if (q) return q.trim();
    }
  } catch {
    /* fall through */
  }
  const m = t.match(/[?&#]?X-Plex-Token=([^&\s#]+)/i);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]).trim();
    } catch {
      return m[1].trim();
    }
  }
  t = t.replace(/^X-Plex-Token\s*[:=]\s*/i, "").trim();
  t = t.replace(/^["']+|["']+$/g, "").trim();
  return t;
}

export function parsePlexHostPort(
  hostRaw: string,
  portRaw?: string | number
): { protocol: string; host: string; port: string } {
  let host = String(hostRaw ?? "").trim();
  let port = String(portRaw ?? "32400").trim() || "32400";
  let protocol = "http";

  if (/^https?:\/\//i.test(host)) {
    try {
      const u = new URL(host);
      protocol = u.protocol === "https:" ? "https" : "http";
      host = u.hostname;
      if (u.port) port = u.port;
    } catch {
      host = host.replace(/^https?:\/\//i, "").split("/")[0] ?? host;
    }
  } else if (host.includes("/")) {
    host = host.split("/")[0] ?? host;
  }

  if (host.startsWith("[") && host.includes("]")) {
    const end = host.indexOf("]");
    const inside = host.slice(1, end);
    const rest = host.slice(end + 1);
    host = inside;
    if (rest.startsWith(":") && /^\d+$/.test(rest.slice(1))) port = rest.slice(1);
  } else if (host.includes(":")) {
    const idx = host.lastIndexOf(":");
    const maybePort = host.slice(idx + 1);
    if (/^\d+$/.test(maybePort)) {
      host = host.slice(0, idx);
      port = maybePort;
    }
  }

  if (host.toLowerCase().endsWith(".plex.direct")) protocol = "https";
  return { protocol, host, port };
}

export function buildPlexBaseUrl(cfg: PlexIntegrationConfig): string {
  const fromUrl = String(cfg.url ?? "").trim().replace(/\/$/, "");
  if (fromUrl && !cfg.host) return fromUrl;
  const parsed = parsePlexHostPort(String(cfg.host ?? fromUrl ?? ""), cfg.port);
  if (!parsed.host) return fromUrl;
  const protocol = cfg.protocol?.trim() || parsed.protocol;
  return `${protocol}://${parsed.host}:${parsed.port}`;
}

export function plexClientIdentifier(cfg: PlexIntegrationConfig): string {
  const existing = String(cfg.clientIdentifier ?? "").trim();
  if (existing) return existing;
  return "nexlify-panel";
}

export function plexRequestHeaders(token: string, clientIdentifier = "nexlify-panel"): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Plex-Client-Identifier": clientIdentifier,
    "X-Plex-Product": "Nexlify Panel",
    "X-Plex-Version": "1.0",
    "X-Plex-Device": "Server",
    "X-Plex-Platform": "Linux",
  };
  if (token) headers["X-Plex-Token"] = token;
  return headers;
}

/** Thumb/art requests must not send Accept: application/json or Plex returns JSON and the proxy 404s. */
export function plexImageRequestHeaders(token: string, clientIdentifier = "nexlify-panel"): Record<string, string> {
  const headers = plexRequestHeaders(token, clientIdentifier);
  headers.Accept = "image/jpeg,image/png,image/webp,image/*,*/*";
  return headers;
}

export function normalizePlexConfig(raw: Record<string, unknown>): PlexIntegrationConfig {
  const token = extractPlexToken(String(raw.token ?? ""));
  const parsed = parsePlexHostPort(String(raw.host ?? raw.url ?? ""), raw.port as string | number | undefined);
  const keys = parsePlexLibraryKeys(raw.libraryKeys, raw.libraryKey);
  return {
    url: raw.url ? String(raw.url) : undefined,
    host: parsed.host || (raw.host ? String(raw.host) : undefined),
    port: parsed.port,
    protocol: raw.protocol ? String(raw.protocol) : parsed.protocol,
    username: raw.username ? String(raw.username) : undefined,
    password: raw.password ? String(raw.password) : undefined,
    token: token || undefined,
    clientIdentifier: raw.clientIdentifier ? String(raw.clientIdentifier) : undefined,
    serverId: raw.serverId ? String(raw.serverId) : null,
    transcodeProfile: raw.transcodeProfile ? String(raw.transcodeProfile) : "direct",
    directStream: raw.directStream !== false,
    libraryKey: keys[0],
    libraryTitle: raw.libraryTitle ? String(raw.libraryTitle) : undefined,
    libraryKeys: keys,
    skipExistingCatalog: raw.skipExistingCatalog !== false,
    excludeNonEnglish: raw.excludeNonEnglish === true,
  };
}

function parsePlexLibraryKeys(raw: unknown, fallbackKey?: unknown): string[] {
  const fromArr = Array.isArray(raw)
    ? raw.map((v) => String(v).trim()).filter(Boolean)
    : typeof raw === "string"
      ? raw.split(/[,\s]+/).map((v) => v.trim()).filter(Boolean)
      : [];
  if (fromArr.length) return [...new Set(fromArr)];
  const one = String(fallbackKey ?? "").trim();
  return one ? [one] : [];
}

/** Empty array = sync every movie/show library (XUI-style default). */
export function plexLibraryKeys(cfg: PlexIntegrationConfig): string[] {
  return parsePlexLibraryKeys(cfg.libraryKeys, cfg.libraryKey);
}

export function plexTokenParam(cfg: PlexIntegrationConfig): string {
  return `X-Plex-Token=${encodeURIComponent(extractPlexToken(String(cfg.token ?? "")))}`;
}

export async function signInPlexTv(
  username: string,
  password: string,
  clientIdentifier = "nexlify-panel"
): Promise<string> {
  const res = await fetch("https://plex.tv/users/sign_in.json", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      ...plexRequestHeaders("", clientIdentifier),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Plex account login failed (HTTP ${res.status}). Check username and password.`);
  }
  const data = (await res.json()) as {
    user?: { authToken?: string; authentication_token?: string };
  };
  const token = data.user?.authToken || data.user?.authentication_token;
  if (!token) throw new Error("Plex account login did not return a token.");
  return String(token);
}

/** Public origin for a streaming server row (LB node). */
export function buildServerStreamingOrigin(server: {
  host: string;
  port: number;
  protocol?: string | null;
  domain?: string | null;
}): string {
  const host = String(server.domain ?? server.host).trim();
  const protocol = server.protocol?.trim() || "http";
  return `${protocol}://${host}:${server.port}`;
}
