import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";
import {
  invalidateConnectionCaches,
  normalizeConnectionIp,
} from "@/lib/connections";
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

const ACTION_LABELS: Record<string, string> = {
  login: "Login / user_info",
  get_live_categories: "Live categories",
  get_live_streams: "Live playlist",
  get_vod_categories: "VOD categories",
  get_vod_streams: "VOD playlist",
  get_series_categories: "Series categories",
  get_series: "Series catalog",
  get_vod_info: "VOD metadata",
  get_series_info: "Series metadata",
  get_short_epg: "EPG",
  get_epg: "EPG",
};

function labelForAction(action: string | null | undefined): string {
  const key = String(action ?? "").trim().toLowerCase();
  if (!key) return "Xtream API";
  return ACTION_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Refresh Live Connections for catalog/API use — does not consume max_connections slots. */
export async function pulseXtreamCatalogActivity(opts: {
  lineId: string;
  ip?: string | null;
  userAgent?: string | null;
  action?: string | null;
}): Promise<void> {
  const lineId = opts.lineId?.trim();
  if (!lineId) return;
  const clientIp = normalizeConnectionIp(opts.ip) || "";
  const actionKey = String(opts.action ?? "login").trim().toLowerCase() || "login";
  const throttleKey = `catalog_pulse:${lineId}:${clientIp}:${actionKey}`;
  if (await cacheGet(throttleKey)) return;
  await cacheSet(throttleKey, 1, 20);

  const streamId = await getCatalogApiStreamId();
  const label = labelForAction(actionKey);
  const uaTag = `api|${label}`;
  const now = new Date();

  try {
    await prisma.liveConnection.upsert({
      where: {
        lineId_streamId_ip: { lineId, streamId, ip: clientIp },
      },
      create: {
        lineId,
        streamId,
        ip: clientIp,
        userAgent: uaTag,
      },
      update: {
        lastSeenAt: now,
        userAgent: uaTag,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code !== "P2002") {
      console.error("[pulseXtreamCatalogActivity]", err);
      return;
    }
    await prisma.liveConnection
      .updateMany({
        where: { lineId, streamId, ip: clientIp },
        data: { lastSeenAt: now, userAgent: uaTag },
      })
      .catch(() => undefined);
  }

  invalidateConnectionCaches({ lineId });
  notifyLiveConnectionsChanged();
}
