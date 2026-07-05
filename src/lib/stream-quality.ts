import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const QUALITY_PREFIX = "quality:score:";
const HISTORY_PREFIX = "quality:history:";

export type StreamQualityMetrics = {
  streamId: string;
  streamName: string;
  score: number; // 0-100
  bitrate: number; // kbps
  resolution: string;
  fps: number;
  bufferingEvents: number;
  avgBufferDuration: number; // ms
  uptime: number; // seconds
  viewerRetention: number; // 0-1
  lastUpdated: number;
};

export type QualityScore = {
  overall: number; // 0-100
  stability: number; // 0-100
  performance: number; // 0-100
  reliability: number; // 0-100
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
};

export function calculateQualityScore(metrics: StreamQualityMetrics): QualityScore {
  // Stability: based on buffering events and uptime
  const bufferingPenalty = Math.min(50, metrics.bufferingEvents * 5);
  const uptimeScore = Math.min(100, (metrics.uptime / 3600) * 20); // 1 hour = 20 points
  const stability = Math.max(0, 100 - bufferingPenalty + uptimeScore * 0.3);

  // Performance: based on bitrate, resolution, fps
  let performance = 50; // base
  if (metrics.bitrate > 5000) performance += 20;
  else if (metrics.bitrate > 2000) performance += 10;
  if (metrics.resolution.includes("1080") || metrics.resolution.includes("1920")) performance += 20;
  else if (metrics.resolution.includes("720") || metrics.resolution.includes("1280")) performance += 15;
  if (metrics.fps >= 60) performance += 10;
  else if (metrics.fps >= 30) performance += 5;
  performance = Math.min(100, performance);

  // Reliability: based on viewer retention
  const reliability = Math.min(100, metrics.viewerRetention * 100);

  // Overall: weighted average
  const overall = Math.round(
    stability * 0.4 + performance * 0.3 + reliability * 0.3
  );

  // Grade
  let grade: QualityScore["grade"];
  if (overall >= 95) grade = "A+";
  else if (overall >= 85) grade = "A";
  else if (overall >= 70) grade = "B";
  else if (overall >= 50) grade = "C";
  else if (overall >= 30) grade = "D";
  else grade = "F";

  return { overall, stability, performance, reliability, grade };
}

export async function getStreamQuality(streamId: string): Promise<StreamQualityMetrics | null> {
  return cacheGet<StreamQualityMetrics>(`${QUALITY_PREFIX}${streamId}`);
}

export async function updateStreamQuality(
  streamId: string,
  metrics: Partial<StreamQualityMetrics>
): Promise<void> {
  const existing = await getStreamQuality(streamId);
  const updated: StreamQualityMetrics = {
    streamId,
    streamName: metrics.streamName ?? existing?.streamName ?? "",
    score: 0,
    bitrate: metrics.bitrate ?? existing?.bitrate ?? 0,
    resolution: metrics.resolution ?? existing?.resolution ?? "",
    fps: metrics.fps ?? existing?.fps ?? 0,
    bufferingEvents: metrics.bufferingEvents ?? existing?.bufferingEvents ?? 0,
    avgBufferDuration: metrics.avgBufferDuration ?? existing?.avgBufferDuration ?? 0,
    uptime: metrics.uptime ?? existing?.uptime ?? 0,
    viewerRetention: metrics.viewerRetention ?? existing?.viewerRetention ?? 0,
    lastUpdated: Date.now(),
  };
  const quality = calculateQualityScore(updated);
  updated.score = quality.overall;
  await cacheSet(`${QUALITY_PREFIX}${streamId}`, updated, 300);

  // Store in history for trends
  const history = await cacheGet<StreamQualityMetrics[]>(`${HISTORY_PREFIX}${streamId}`) ?? [];
  history.push(updated);
  if (history.length > 100) history.shift();
  await cacheSet(`${HISTORY_PREFIX}${streamId}`, history, 3600);
}

export async function getAllStreamQualities(): Promise<StreamQualityMetrics[]> {
  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE" },
    select: { id: true, name: true },
    take: 200,
  });

  const qualities: StreamQualityMetrics[] = [];
  for (const stream of streams) {
    const q = await getStreamQuality(stream.id);
    if (q) qualities.push(q);
  }

  return qualities.sort((a, b) => b.score - a.score);
}

export async function getQualityDistribution(): Promise<Record<string, number>> {
  const qualities = await getAllStreamQualities();
  const dist: Record<string, number> = { "A+": 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const q of qualities) {
    const score = calculateQualityScore(q);
    dist[score.grade]++;
  }
  return dist;
}
