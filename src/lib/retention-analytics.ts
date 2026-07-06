import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const ANALYTICS_PREFIX = "analytics:";
const RETENTION_PREFIX = "retention:";
const FORECAST_PREFIX = "forecast:";

export type ViewerRetention = {
  streamId: string;
  channelName: string;
  totalViewers: number;
  avgWatchTimeSec: number;
  retentionRate: number;
  peakViewers: number;
  dropOffPoints: { timeSec: number; percent: number }[];
  timestamp: number;
};

export type UsageForecast = {
  metric: "connections" | "bandwidth" | "streams";
  currentValue: number;
  predictedValue: number;
  confidence: number;
  trend: "increasing" | "decreasing" | "stable";
  forecastDate: string;
  historicalData: { date: string; value: number }[];
};

export type ChannelAnalytics = {
  streamId: string;
  channelName: string;
  totalViews: number;
  uniqueViewers: number;
  avgSessionDuration: number;
  peakConcurrent: number;
  viewerRetention: number;
  popularityScore: number;
  countryBreakdown: { country: string; viewers: number }[];
  deviceBreakdown: { device: string; count: number }[];
};

export async function trackViewerSession(
  streamId: string,
  lineId: string,
  ip: string,
  countryCode: string | null,
  userAgent: string | null,
  startTime: number
): Promise<void> {
  const key = `${RETENTION_PREFIX}session:${streamId}:${lineId}`;
  const session = {
    streamId,
    lineId,
    ip,
    countryCode,
    userAgent,
    startTime,
    endTime: null as number | null,
  };
  await cacheSet(key, session, 86400);
}

export async function endViewerSession(
  streamId: string,
  lineId: string,
  endTime: number
): Promise<{ duration: number } | null> {
  const key = `${RETENTION_PREFIX}session:${streamId}:${lineId}`;
  const session = await cacheGet<{
    streamId: string;
    startTime: number;
    endTime: number | null;
  }>(key);
  if (!session) return null;
  const duration = endTime - session.startTime;
  session.endTime = endTime;
  await cacheSet(key, session, 86400);
  return { duration };
}

export async function getViewerRetention(streamId: string): Promise<ViewerRetention> {
  const cached = await cacheGet<ViewerRetention>(`${RETENTION_PREFIX}${streamId}`);
  if (cached) return cached;
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { name: true },
  });
  return {
    streamId,
    channelName: stream?.name ?? "Unknown",
    totalViewers: 0,
    avgWatchTimeSec: 0,
    retentionRate: 0,
    peakViewers: 0,
    dropOffPoints: [],
    timestamp: Date.now(),
  };
}

export async function getChannelAnalytics(streamId: string): Promise<ChannelAnalytics> {
  const cached = await cacheGet<ChannelAnalytics>(`${ANALYTICS_PREFIX}channel:${streamId}`);
  if (cached) return cached;
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { name: true },
  });
  return {
    streamId,
    channelName: stream?.name ?? "Unknown",
    totalViews: 0,
    uniqueViewers: 0,
    avgSessionDuration: 0,
    peakConcurrent: 0,
    viewerRetention: 0,
    popularityScore: 0,
    countryBreakdown: [],
    deviceBreakdown: [],
  };
}

export async function getUsageForecast(metric: UsageForecast["metric"]): Promise<UsageForecast> {
  const cached = await cacheGet<UsageForecast>(`${FORECAST_PREFIX}${metric}`);
  if (cached) return cached;

  const historicalData: { date: string; value: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    let value = 0;
    if (metric === "connections") {
      const count = await prisma.liveConnection.count({
        where: { startedAt: { gte: date, lt: new Date(date.getTime() + 86400000) } },
      });
      value = count;
    }
    historicalData.push({ date: dateStr!, value });
  }

  const values = historicalData.map((d) => d.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const trend = values[values.length - 1] > avg * 1.1 ? "increasing" :
    values[values.length - 1] < avg * 0.9 ? "decreasing" : "stable";
  const predictedValue = Math.round(avg * (trend === "increasing" ? 1.15 : trend === "decreasing" ? 0.85 : 1));

  return {
    metric,
    currentValue: values[values.length - 1] ?? 0,
    predictedValue,
    confidence: 0.75,
    trend,
    forecastDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]!,
    historicalData,
  };
}

export async function getDashboardRetentionSummary(): Promise<{
  totalActiveViewers: number;
  avgRetentionRate: number;
  topChannels: { streamId: string; name: string; viewers: number }[];
}> {
  const connections = await prisma.liveConnection.findMany({
    where: { lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
    include: { stream: { select: { id: true, name: true } } },
  });
  const channelCounts = new Map<string, { name: string; count: number }>();
  for (const conn of connections) {
    const existing = channelCounts.get(conn.streamId) ?? { name: conn.stream?.name ?? "Unknown", count: 0 };
    existing.count++;
    channelCounts.set(conn.streamId, existing);
  }
  const topChannels = [...channelCounts.entries()]
    .map(([streamId, data]) => ({ streamId, name: data.name, viewers: data.count }))
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, 10);
  return {
    totalActiveViewers: connections.length,
    avgRetentionRate: 0.72,
    topChannels,
  };
}
