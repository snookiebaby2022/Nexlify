import {
  buildPlexBaseUrl,
  extractPlexToken,
  normalizePlexConfig,
  plexClientIdentifier,
  plexImageRequestHeaders,
  plexTokenParam,
  type PlexIntegrationConfig,
} from "@/lib/plex-config";
import { fetchPlexJson } from "@/lib/plex-playback";

type PlexMeta = {
  thumb?: string;
  art?: string;
  parentThumb?: string;
  grandparentThumb?: string;
  composite?: string;
  type?: string;
  title?: string;
};

function absolutePlexUrl(base: string, path: string, token: string): string {
  const t = path.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  const sep = t.startsWith("/") ? "" : "/";
  return `${base}${sep}${t}?X-Plex-Token=${encodeURIComponent(token)}`;
}

async function fetchImage(url: string, token: string, clientId: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: plexImageRequestHeaders(token, clientId),
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("json") || ct.includes("html") || ct.includes("xml")) return null;
    if (ct.startsWith("image/") || ct.startsWith("application/octet-stream") || !ct) {
      return res;
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve Plex poster URLs to try (metadata thumb paths, then legacy /thumb). */
export async function plexPosterCandidateUrls(
  cfg: PlexIntegrationConfig,
  itemId: string
): Promise<string[]> {
  const base = buildPlexBaseUrl(cfg);
  const token = extractPlexToken(String(cfg.token ?? ""));
  if (!base || !token) return [];

  const clientId = plexClientIdentifier(cfg);
  const tokenParam = plexTokenParam(cfg);
  const urls: string[] = [];

  try {
    const meta = await fetchPlexJson<{ MediaContainer?: { Metadata?: PlexMeta[] } }>(
      `${base}/library/metadata/${itemId}?${tokenParam}`,
      clientId,
      8_000
    );
    const item = meta.MediaContainer?.Metadata?.[0];
    if (item) {
      for (const field of [
        item.thumb,
        item.composite,
        item.art,
        item.parentThumb,
        item.grandparentThumb,
      ]) {
        const u = absolutePlexUrl(base, String(field ?? ""), token);
        if (u) urls.push(u);
      }
    }
  } catch {
    /* metadata unavailable */
  }

  urls.push(`${base}/library/metadata/${itemId}/thumb?X-Plex-Token=${encodeURIComponent(token)}`);
  urls.push(
    `${base}/photo/:/transcode?width=500&height=750&minSize=1&upscale=1&url=${encodeURIComponent(
      `/library/metadata/${itemId}/thumb`
    )}&X-Plex-Token=${encodeURIComponent(token)}`
  );

  return [...new Set(urls)];
}

export async function fetchPlexPosterResponse(
  cfg: PlexIntegrationConfig,
  itemId: string
): Promise<Response | null> {
  const token = extractPlexToken(String(cfg.token ?? ""));
  if (!token) return null;
  const clientId = plexClientIdentifier(cfg);
  for (const url of await plexPosterCandidateUrls(cfg, itemId)) {
    const res = await fetchImage(url, token, clientId);
    if (res) return res;
  }
  return null;
}
