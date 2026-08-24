import { parseIntegrationStreamUrl } from "@/lib/integration-stream-url";

/** Same-origin poster URL so the browser never talks to the Plex host. */
export function plexArtworkPath(integrationId: string, itemId: string): string {
  return `/api/artwork/plex/${encodeURIComponent(integrationId)}/${encodeURIComponent(itemId)}`;
}

export function displayStreamIcon(stream: {
  streamIcon?: string | null;
  streamUrl?: string | null;
}): string | null {
  const parsed = stream.streamUrl ? parseIntegrationStreamUrl(stream.streamUrl) : null;
  if (parsed?.type === "plex") return plexArtworkPath(parsed.integrationId, parsed.itemId);
  const icon = String(stream.streamIcon ?? "").trim();
  return icon || null;
}
