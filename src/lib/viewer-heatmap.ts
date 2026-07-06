import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const HEATMAP_PREFIX = "heatmap:";

export type HeatmapPoint = {
  lat: number;
  lon: number;
  count: number;
  intensity: number;
};

export type ViewerHeatmap = {
  points: HeatmapPoint[];
  totalViewers: number;
  peakTime: string;
  lastUpdated: number;
};

export async function getViewerHeatmap(): Promise<ViewerHeatmap> {
  const cached = await cacheGet<ViewerHeatmap>(`${HEATMAP_PREFIX}global`);
  if (cached) return cached;

  // Get active connections with geo data
  const connections = await prisma.liveConnection.findMany({
    where: {
      startedAt: { gte: new Date(Date.now() - 3600000) },
    },
    select: {
      ip: true,
      startedAt: true,
    },
    take: 1000,
  });

  // In a real implementation, this would use geo-IP to get lat/lon
  // For now, return empty points (would be populated by geo-IP lookup)
  const points: HeatmapPoint[] = [];

  const heatmap: ViewerHeatmap = {
    points,
    totalViewers: connections.length,
    peakTime: new Date().toISOString(),
    lastUpdated: Date.now(),
  };

  await cacheSet(`${HEATMAP_PREFIX}global`, heatmap, 60);
  return heatmap;
}

export async function getPeakViewingTimes(): Promise<{ hour: number; count: number }[]> {
  const cached = await cacheGet<{ hour: number; count: number }[]>(`${HEATMAP_PREFIX}peaks`);
  if (cached) return cached;

  const connections = await prisma.liveConnection.findMany({
    where: {
      startedAt: { gte: new Date(Date.now() - 86400000) },
    },
    select: { startedAt: true },
    take: 10000,
  });

  const hourCounts = new Map<number, number>();
  connections.forEach((c) => {
    const hour = new Date(c.startedAt).getHours();
    const count = hourCounts.get(hour) ?? 0;
    hourCounts.set(hour, count + 1);
  });

  const peaks = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count);

  await cacheSet(`${HEATMAP_PREFIX}peaks`, peaks, 300);
  return peaks;
}
