import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const BANDWIDTH_PREFIX = "bandwidth:predict:";
const HISTORY_PREFIX = "bandwidth:history:";

export type BandwidthSnapshot = {
  timestamp: number;
  totalMbps: number;
  peakMbps: number;
  avgMbps: number;
  connections: number;
};

export type BandwidthPrediction = {
  predictedMbps: number;
  confidence: number; // 0-1
  trend: "increasing" | "decreasing" | "stable";
  peakTime: string;
  recommendation: string;
};

export async function recordBandwidthUsage(
  totalMbps: number,
  connections: number
): Promise<void> {
  const snapshot: BandwidthSnapshot = {
    timestamp: Date.now(),
    totalMbps,
    peakMbps: totalMbps,
    avgMbps: totalMbps,
    connections,
  };

  // Store in history
  const history = await cacheGet<BandwidthSnapshot[]>(`${HISTORY_PREFIX}global`) ?? [];
  history.push(snapshot);
  if (history.length > 1000) history.shift();
  await cacheSet(`${HISTORY_PREFIX}global`, history, 86400);

  // Update current
  await cacheSet(`${BANDWIDTH_PREFIX}current`, snapshot, 60);
}

export async function predictBandwidth(hours: number = 1): Promise<BandwidthPrediction> {
  const history = await cacheGet<BandwidthSnapshot[]>(`${HISTORY_PREFIX}global`) ?? [];
  
  if (history.length < 10) {
    return {
      predictedMbps: 0,
      confidence: 0.1,
      trend: "stable",
      peakTime: "Unknown",
      recommendation: "Not enough data for prediction",
    };
  }

  // Calculate trend
  const recent = history.slice(-10);
  const older = history.slice(-20, -10);
  const recentAvg = recent.reduce((a, b) => a + b.totalMbps, 0) / recent.length;
  const olderAvg = older.length ? older.reduce((a, b) => a + b.totalMbps, 0) / older.length : recentAvg;
  
  let trend: BandwidthPrediction["trend"];
  const change = (recentAvg - olderAvg) / olderAvg;
  if (change > 0.1) trend = "increasing";
  else if (change < -0.1) trend = "decreasing";
  else trend = "stable";

  // Predict based on trend
  const predictedMbps = Math.round(recentAvg * (trend === "increasing" ? 1.2 : trend === "decreasing" ? 0.8 : 1));

  // Find peak time
  const peakHour = history.reduce((max, snap) => {
    const hour = new Date(snap.timestamp).getHours();
    return snap.totalMbps > (max?.totalMbps ?? 0) ? { ...snap, hour } : max;
  }, null as (BandwidthSnapshot & { hour: number }) | null);

  // Recommendation
  let recommendation = "Bandwidth usage is stable.";
  if (trend === "increasing") {
    recommendation = "Bandwidth is increasing. Consider scaling up or optimizing streams.";
  } else if (trend === "decreasing") {
    recommendation = "Bandwidth is decreasing. Good time for maintenance.";
  }

  return {
    predictedMbps,
    confidence: Math.min(0.9, history.length / 100),
    trend,
    peakTime: peakHour ? `${peakHour.hour}:00` : "Unknown",
    recommendation,
  };
}

export async function getBandwidthHistory(hours: number = 24): Promise<BandwidthSnapshot[]> {
  const history = await cacheGet<BandwidthSnapshot[]>(`${HISTORY_PREFIX}global`) ?? [];
  const cutoff = Date.now() - hours * 3600 * 1000;
  return history.filter(s => s.timestamp > cutoff);
}

export async function getBandwidthStats(): Promise<{
  current: number;
  peak24h: number;
  avg24h: number;
  totalConnections: number;
}> {
  const current = await cacheGet<BandwidthSnapshot>(`${BANDWIDTH_PREFIX}current`);
  const history = await getBandwidthHistory(24);
  
  const peak24h = Math.max(...history.map(s => s.totalMbps), 0);
  const avg24h = history.length ? history.reduce((a, b) => a + b.totalMbps, 0) / history.length : 0;
  const totalConnections = current?.connections ?? 0;

  return {
    current: current?.totalMbps ?? 0,
    peak24h: Math.round(peak24h),
    avg24h: Math.round(avg24h),
    totalConnections,
  };
}
