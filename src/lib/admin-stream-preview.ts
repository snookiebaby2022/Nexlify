import { assertPublicHttpUrl } from "@/lib/ssrf";
import { isHlsPlaybackUrl, rewriteHlsManifestForRelay, sanitizeHlsPlaylist } from "@/lib/hls-playback";

export const ADMIN_PROXY_MAX_REDIRECTS = 5;

export function adminProxyPlaybackPath(
  token: string,
  opts?: { hls?: boolean; relayTarget?: string }
): string {
  const params = new URLSearchParams({ t: token });
  if (opts?.hls) params.set("hls", "1");
  if (opts?.relayTarget) params.set("r", encodePreviewRelayTarget(opts.relayTarget));
  return `/api/admin/streams/proxy?${params.toString()}`;
}

export function encodePreviewRelayTarget(upstream: string): string {
  return Buffer.from(upstream, "utf8").toString("base64url");
}

export function decodePreviewRelayTarget(encoded: string | null, rootUpstream: string): string {
  if (!encoded?.trim()) return rootUpstream;
  try {
    const target = Buffer.from(encoded, "base64url").toString("utf8").trim();
    return target || rootUpstream;
  } catch {
    return rootUpstream;
  }
}

/** Treat extensionless http(s) live URLs as HLS when the admin player requests hls=1. */
export function adminPreviewWantsHls(url: string, hlsParam: boolean): boolean {
  if (hlsParam) return true;
  return isHlsPlaybackUrl(url) || url.includes("/hls/");
}

export function rewriteAdminHlsManifest(
  body: string,
  manifestUrl: string,
  relay: (absoluteUrl: string) => string
): string {
  return rewriteHlsManifestForRelay(body, manifestUrl, relay);
}

export function looksLikeHlsManifest(body: string, contentType: string, forceHls: boolean): boolean {
  if (forceHls) return true;
  const ct = contentType.toLowerCase();
  if (ct.includes("mpegurl") || ct.includes("m3u8")) return true;
  const head = body.slice(0, 64).trimStart();
  return head.startsWith("#EXTM3U");
}

export type AdminUpstreamFetchResult = {
  body: Buffer;
  contentType: string;
  finalUrl: string;
  status: number;
};

/**
 * Fetch upstream for admin preview with manual redirects (max 5) and SSRF checks.
 */
export async function fetchAdminUpstream(
  startUrl: string,
  opts?: { timeoutMs?: number; userAgent?: string }
): Promise<AdminUpstreamFetchResult> {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const ua = opts?.userAgent?.trim() || "VLC/3.0.20 LibVLC/3.0.20";
  let current = startUrl;

  for (let hop = 0; hop <= ADMIN_PROXY_MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        headers: { "User-Agent": ua, Accept: "*/*" },
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hop >= ADMIN_PROXY_MAX_REDIRECTS) {
        throw new Error(`Too many redirects (${hop})`);
      }
      current = new URL(loc, current).href;
      continue;
    }

    if (!res.ok) {
      throw new Error(`Upstream HTTP ${res.status}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    return { body: buf, contentType, finalUrl: current, status: res.status };
  }

  throw new Error("Redirect loop");
}

export function sanitizeAdminManifestBody(body: string): string {
  return sanitizeHlsPlaylist(body);
}
