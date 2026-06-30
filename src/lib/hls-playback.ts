const HLS_URL_RE = /\.m3u8(?:[?#]|$)/i;

export function isHlsPlaybackUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (HLS_URL_RE.test(u)) return true;
  try {
    const parsed = new URL(u);
    return parsed.pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return false;
  }
}

export function hlsRelayCacheKey(lineId: string, streamId: string): string {
  return `hls:relay:root:${lineId}:${streamId}`;
}

export function buildHlsRelayUrl(
  panelOrigin: string,
  username: string,
  password: string,
  streamId: string,
  upstreamUrl: string
): string {
  const token = Buffer.from(upstreamUrl, "utf8").toString("base64url");
  const origin = panelOrigin.replace(/\/+$/, "");
  return `${origin}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(streamId)}/hls?u=${encodeURIComponent(token)}`;
}

/** Block SSRF — only public http(s) targets. */
export function isSafeUpstreamUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isAllowedHlsRelayTarget(target: string, _rootUpstream: string): boolean {
  // Line auth is required to hit the relay; block only private/local SSRF targets.
  return isSafeUpstreamUrl(target);
}

/** Rewrite playlist lines so segments and sub-playlists go through the panel relay. */
export function rewriteHlsManifestForRelay(
  body: string,
  manifestUrl: string,
  relay: (absoluteUrl: string) => string
): string {
  const base = new URL(manifestUrl);
  return body
    .split("\n")
    .map((line) => {
      let out = line.replace(/URI="([^"]+)"/gi, (_, uri: string) => {
        try {
          return `URI="${relay(new URL(uri, base).href)}"`;
        } catch {
          return line;
        }
      });
      const trimmed = out.trim();
      if (!trimmed || trimmed.startsWith("#")) return out;
      try {
        return relay(new URL(trimmed, base).href);
      } catch {
        return out;
      }
    })
    .join("\n");
}

/** @deprecated Use rewriteHlsManifestForRelay — kept for tests */
export function rewriteHlsManifest(body: string, manifestUrl: string): string {
  const base = new URL(manifestUrl);
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      try {
        return new URL(trimmed, base).href;
      } catch {
        return line;
      }
    })
    .join("\n");
}

export type HlsFetchResult =
  | { ok: true; kind: "manifest"; body: string; finalUrl: string }
  | { ok: true; kind: "segment"; body: ArrayBuffer; contentType: string; finalUrl: string }
  | { ok: false; status: number; detail?: string };

export async function fetchHlsUpstream(
  upstreamUrl: string,
  userAgent?: string,
  range?: string | null
): Promise<HlsFetchResult> {
  const headers: Record<string, string> = {
    "User-Agent":
      userAgent?.trim() ||
      "Mozilla/5.0 (compatible; Nexlify/1.0; +https://nexlify.live)",
    Accept: "*/*",
  };
  if (range) headers.Range = range;

  const res = await fetch(upstreamUrl, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, detail: res.statusText };
  }

  const contentType = res.headers.get("content-type") ?? "";
  const finalUrl = res.url || upstreamUrl;

  if (
    contentType.includes("mpegurl") ||
    contentType.includes("x-mpegURL") ||
    finalUrl.toLowerCase().includes(".m3u8")
  ) {
    const body = await res.text();
    if (!body.trim().startsWith("#EXT")) {
      return { ok: false, status: 502, detail: "Invalid HLS manifest" };
    }
    return { ok: true, kind: "manifest", body, finalUrl };
  }

  const body = await res.arrayBuffer();
  return {
    ok: true,
    kind: "segment",
    body,
    contentType: contentType || "video/mp2t",
    finalUrl,
  };
}

export async function fetchHlsManifestForClient(
  upstreamUrl: string,
  userAgent?: string
): Promise<{ ok: true; body: string; finalUrl: string } | { ok: false; status: number }> {
  const res = await fetchHlsUpstream(upstreamUrl, userAgent);
  if (!res.ok) return { ok: false, status: res.status };
  if (res.kind !== "manifest") return { ok: false, status: 502 };
  return { ok: true, body: res.body, finalUrl: res.finalUrl };
}
