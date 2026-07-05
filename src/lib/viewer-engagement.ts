import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const ENGAGEMENT_PREFIX = "engagement:";

export type ViewerEngagement = {
  streamId: string;
  streamName: string;
  totalViewers: number;
  activeViewers: number;
  avgWatchTime: number; // seconds
  peakViewers: number;
  dropOffPoints: { time: number; count: number }[];
  trending: boolean;
  engagementScore: number; // 0-100
};

export type ChannelTrend = {
  streamId: string;
  streamName: string;
  viewers: number;
  change: number; // percentage change
  trend: "rising" | "falling" | "stable";
};

export async function trackViewerEngagement(
  streamId: string,
  viewerId: string,
  startTime: number
): Promise<void> {
  const key = `${ENGAGEMENT_PREFIX}${streamId}`;
  const engagement = await cacheGet<ViewerEngagement>(key) ?? {
    streamId,
    streamName: "",
    totalViewers: 0,
    activeViewers: 0,
    avgWatchTime: 0,
    peakViewers: 0,
    dropOffPoints: [],
    trending: false,
    engagementScore: 0,
  };

  engagement.activeViewers++;
  engagement.totalViewers++;
  engagement.peakViewers = Math.max(engagement.peakViewers, engagement.activeViewers);
  await cacheSet(key, engagement, 300);
}

export async function endViewerEngagement(
  streamId: string,
  viewerId: string,
  watchTime: number
): Promise<void> {
  const key = `${ENGAGEMENT_PREFIX}${streamId}`;
  const engagement = await cacheGet<ViewerEngagement>(key);
  if (!engagement) return;

  engagement.activeViewers = Math.max(0, engagement.activeViewers - 1);
  engagement.avgWatchTime = (engagement.avgWatchTime + watchTime) / 2;

  // Track drop-off points
  const dropOffMinute = Math.floor(watchTime / 60);
  const existing = engagement.dropOffPoints.find(p => p.time === dropOffMinute);
  if (existing) existing.count++;
  else engagement.dropOffPoints.push({ time: dropOffMinute, count: 1 });

  await cacheSet(key, engagement, 300);
}

export async function getStreamEngagement(streamId: string): Promise<ViewerEngagement | null> {
  return cacheGet<ViewerEngagement>(`${ENGAGEMENT_PREFIX}${streamId}`);
}

export async function getTopEngagedStreams(limit: number = 10): Promise<ViewerEngagement[]> {
  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE" },
    select: { id: true, name: true },
    take: 50,
  });

  const engagements: ViewerEngagement[] = [];
  for (const stream of streams) {
    const e = await getStreamEngagement(stream.id);
    if (e && e.activeViewers > 0) {
      e.streamName = stream.name;
      engagements.push(e);
    }
  }

  return engagements.sort((a, b) => b.activeViewers - a.activeViewers).slice(0, limit);
}

export async function getChannelTrends(): Promise<ChannelTrend[]> {
  const current = await getTopEngagedStreams(50);
  
  return current.map(c => {
    const change = c.totalViewers > 0 
      ? Math.round(((c.activeViewers - c.totalViewers / 2) / (c.totalViewers / 2)) * 100)
      : 0;
    
    return {
      streamId: c.streamId,
      streamName: c.streamName,
      viewers: c.activeViewers,
      change,
      trend: change > 10 ? "rising" : change < -10 ? "falling" : "stable",
    };
  });
}

export async function getEngagementDashboard(): Promise<{
  totalViewers: number;
  avgWatchTime: number;
  trendingChannels: ChannelTrend[];
  peakHour: string;
}> {
  const trends = await getChannelTrends();
  const totalViewers = trends.reduce((a, b) => a + b.viewers, 0);
  
  // Find peak hour (simplified)
  const now = new Date();
  const peakHour = `${now.getHours()}:00`;

  return {
    totalViewers,
    avgWatchTime: 0, // Would need historical data
    trendingChannels: trends.filter(t => t.trend === "rising"),
    peakHour,
  };
}
