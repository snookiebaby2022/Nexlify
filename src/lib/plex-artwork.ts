import { parseIntegrationStreamUrl } from "@/lib/integration-stream-url";

/** Same-origin poster URL so the browser never talks to the Plex host. */
export function plexArtworkPath(integrationId: string, itemId: string): string {
  return `/api/artwork/plex/${encodeURIComponent(integrationId)}/${encodeURIComponent(itemId)}`;
}

function plexIdsFromStreamIcon(icon: string): { integrationId: string; itemId: string } | null {
  const t = icon.trim();
  const proxy = t.match(/\/api\/artwork\/plex\/([^/]+)\/([^/?#]+)/i);
  if (proxy) return { integrationId: decodeURIComponent(proxy[1]), itemId: decodeURIComponent(proxy[2]) };
  const direct = t.match(/\/library\/metadata\/(\d+)\//i);
  if (direct) return null;
  return null;
}

/** Absolute poster URL for Xtream/Smarters (relative paths are ignored by most IPTV apps). */
export function plexArtworkUrl(integrationId: string, itemId: string, origin?: string | null): string {
  const path = plexArtworkPath(integrationId, itemId);
  const base = String(origin ?? process.env.NEXT_PUBLIC_SERVER_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

/** Same-origin poster URL for the admin UI (never leave absolute http://panel host). */
export function displayStreamIcon(stream: {
  streamIcon?: string | null;
  streamUrl?: string | null;
}): string | null {
  const icon = String(stream.streamIcon ?? "").trim();

  // Prefer stored poster: Plex sync writes show-level artwork into streamIcon while
  // streamUrl is often an episode rating key — using streamUrl alone shows stills/wrong art.
  if (icon) {
    if (icon.startsWith("/api/artwork/plex/")) return icon;

    const fromIcon = plexIdsFromStreamIcon(icon);
    if (fromIcon) return plexArtworkPath(fromIcon.integrationId, fromIcon.itemId);

    // Absolute panel artwork URLs → relative (avoids mixed-content on https:// admin)
    const absProxy = icon.match(/^https?:\/\/[^/]+(\/api\/artwork\/plex\/[^/?#]+)/i);
    if (absProxy) return absProxy[1];

    if (!icon.includes("/library/metadata/") && !icon.includes("X-Plex-Token=")) {
      return icon; // TMDB / CDN / other http(s) posters
    }
  }

  const parsed = stream.streamUrl ? parseIntegrationStreamUrl(stream.streamUrl) : null;
  if (parsed?.type === "plex") {
    return plexArtworkPath(parsed.integrationId, parsed.itemId);
  }

  if (icon.includes("/library/metadata/") || icon.includes("X-Plex-Token=")) {
    return null;
  }

  return icon || null;
}
