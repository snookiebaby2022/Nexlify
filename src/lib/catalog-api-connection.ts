import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";
import { invalidateConnectionCaches } from "@/lib/connections";
import { notifyLiveConnectionsChanged } from "@/lib/connection-live-bus";

import { CATALOG_API_CHANNEL_MARKER } from "@/lib/catalog-api-channel";

export { CATALOG_API_CHANNEL_MARKER };

let catalogApiStreamId: string | null = null;

export async function getCatalogApiStreamId(): Promise<string> {
  if (catalogApiStreamId) return catalogApiStreamId;
  const found = await prisma.stream.findFirst({
    where: { channelId: CATALOG_API_CHANNEL_MARKER },
    select: { id: true },
  });
  if (found) {
    catalogApiStreamId = found.id;
    return found.id;
  }
  const created = await prisma.stream.create({
    data: {
      name: "Xtream API",
      type: "LIVE",
      channelId: CATALOG_API_CHANNEL_MARKER,
      isActive: false,
      streamUrl: "http://127.0.0.1/__nexlify_api__",
    },
    select: { id: true },
  });
  catalogApiStreamId = created.id;
  return created.id;
}

export function isCatalogApiStreamId(id: string | null | undefined): boolean {
  return Boolean(id && catalogApiStreamId && id === catalogApiStreamId);
}

export function catalogApiActivityLabel(userAgent?: string | null): string | null {
  const ua = String(userAgent ?? "").trim();
  if (!ua.startsWith("api|")) return null;
  return ua.slice(4).trim() || "Xtream API";
}

/** Remove leftover catalog/API LiveConnection rows (throttled). */
export async function purgeCatalogApiLiveConnections(): Promise<void> {
  const throttleKey = "catalog_api:purge_done";
  if (await cacheGet(throttleKey)) return;
  await cacheSet(throttleKey, 1, 3600);
  try {
    const result = await prisma.liveConnection.deleteMany({
      where: { stream: { channelId: CATALOG_API_CHANNEL_MARKER } },
    });
    if (result.count > 0) {
      invalidateConnectionCaches();
      notifyLiveConnectionsChanged();
    }
  } catch {
    // ignore — stream marker may not exist yet
  }
}

/**
 * Catalog/API polls (player_api / get.php) must not create LiveConnection rows.
 * Kept as a no-op so any remaining call sites stay safe.
 */
export async function pulseXtreamCatalogActivity(_opts: {
  lineId: string;
  ip?: string | null;
  userAgent?: string | null;
  action?: string | null;
}): Promise<void> {
  // intentionally no-op
}
