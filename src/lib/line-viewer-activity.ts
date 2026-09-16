import { prisma } from "@/lib/prisma";
import { LIVE_LIST_STALE_MS, isTestConnectionIp } from "@/lib/connections";
import { isCatalogApiChannelId } from "@/lib/catalog-api-channel";

export type LineViewerActivity = {
  lastApiAt: string | null;
  lastPlayAt: string | null;
  lastApiLabel: string | null;
  lastPlayStreamName: string | null;
};

function parseApiLabel(userAgent: string | null | undefined): string | null {
  const ua = String(userAgent ?? "").trim();
  if (!ua.toLowerCase().startsWith("api|")) return null;
  const label = ua.slice(4).trim();
  return label || "API";
}

/** Latest catalog API pulse vs playback pulse for a line (from LiveConnection rows). */
export async function getLineViewerActivity(lineId: string): Promise<LineViewerActivity> {
  const staleBefore = new Date(Date.now() - LIVE_LIST_STALE_MS);
  const rows = await prisma.liveConnection.findMany({
    where: { lineId, lastSeenAt: { gte: staleBefore } },
    select: {
      lastSeenAt: true,
      userAgent: true,
      ip: true,
      stream: { select: { channelId: true, name: true } },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 40,
  });

  let lastApiAt: Date | null = null;
  let lastApiLabel: string | null = null;
  let lastPlayAt: Date | null = null;
  let lastPlayStreamName: string | null = null;

  for (const row of rows) {
    if (isTestConnectionIp(row.ip)) continue;
    const catalog = isCatalogApiChannelId(row.stream?.channelId);
    if (catalog) {
      if (!lastApiAt || row.lastSeenAt > lastApiAt) {
        lastApiAt = row.lastSeenAt;
        lastApiLabel = parseApiLabel(row.userAgent);
      }
    } else {
      if (!lastPlayAt || row.lastSeenAt > lastPlayAt) {
        lastPlayAt = row.lastSeenAt;
        lastPlayStreamName = row.stream?.name ?? null;
      }
    }
  }

  return {
    lastApiAt: lastApiAt?.toISOString() ?? null,
    lastPlayAt: lastPlayAt?.toISOString() ?? null,
    lastApiLabel,
    lastPlayStreamName,
  };
}
