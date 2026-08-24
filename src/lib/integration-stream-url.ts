export const NEXLIFY_INTEGRATION = "nexlify://";

export function buildIntegrationStreamUrl(
  type: string,
  integrationId: string,
  itemId: string
): string {
  return `${NEXLIFY_INTEGRATION}${type}/${integrationId}/${encodeURIComponent(itemId)}`;
}

export function parseIntegrationStreamUrl(
  url: string
): { type: string; integrationId: string; itemId: string } | null {
  if (!url.startsWith(NEXLIFY_INTEGRATION)) return null;
  const rest = url.slice(NEXLIFY_INTEGRATION.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const type = rest.slice(0, slash);
  const afterType = rest.slice(slash + 1);
  const slash2 = afterType.indexOf("/");
  if (slash2 < 0) return null;
  const integrationId = afterType.slice(0, slash2);
  const itemId = decodeURIComponent(afterType.slice(slash2 + 1));
  if (!type || !integrationId || !itemId) return null;
  return { type, integrationId, itemId };
}

export function isIntegrationStreamUrl(url: string): boolean {
  return url.startsWith(NEXLIFY_INTEGRATION);
}

const INTEGRATION_SOURCE_SUFFIX =
  /\s*\((Plex|Emby|Jellyfin|YouTube|Spotify|Deezer|Apple Music)\)\s*$/i;

/** Remove trailing "(Plex)" / "(Emby)" labels from imported stream titles. */
export function stripIntegrationSourceSuffix(name: string): string {
  return String(name ?? "")
    .replace(INTEGRATION_SOURCE_SUFFIX, "")
    .trim();
}

const INTEGRATION_LABELS: Record<string, string> = {
  plex: "Plex",
  emby: "Emby",
  jellyfin: "Jellyfin",
  youtube: "YouTube",
  spotify: "Spotify",
  deezer: "Deezer",
  apple: "Apple Music",
};

/** Human label for nexlify:// integration stream URLs (null when not an integration stream). */
export function integrationSourceLabel(streamUrl: string): string | null {
  const parsed = parseIntegrationStreamUrl(streamUrl);
  if (!parsed) return null;
  return INTEGRATION_LABELS[parsed.type] ?? parsed.type;
}
