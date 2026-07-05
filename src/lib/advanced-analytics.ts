import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const ANALYTICS_PREFIX = "analytics:";

export type AnalyticsData = {
  totalViewers: number;
  peakViewers: number;
  avgWatchTime: number;
  topStreams: { streamId: string; streamName: string; viewers: number }[];
  viewerRetention: number;
  revenue: number;
  lastUpdated: number;
};

export async function getAdvancedAnalytics(): Promise<AnalyticsData> {
  const cached = await cacheGet<AnalyticsData>(`${ANALYTICS_PREFIX}global`);
  if (cached) return cached;

  const connections = await prisma.connectionLog.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 86400000) },
    },
    take: 10000,
  });

  const streamViewers = new Map<string, number>();
  connections.forEach((c) => {
    const count = streamViewers.get(c.streamId) ?? 0;
    streamViewers.set(c.streamId, count + 1);
  });

  const topStreams = Array.from(streamViewers.entries())
    .map(([streamId, viewers]) => ({ streamId, streamName: "", viewers }))
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, 10);

  const analytics: AnalyticsData = {
    totalViewers: connections.length,
    peakViewers: Math.max(...Array.from(streamViewers.values()), 0),
    avgWatchTime: 0,
    topStreams,
    viewerRetention: 0,
    revenue: 0,
    lastUpdated: Date.now(),
  };

  await cacheSet(`${ANALYTICS_PREFIX}global`, analytics, 300);
  return analytics;
}
