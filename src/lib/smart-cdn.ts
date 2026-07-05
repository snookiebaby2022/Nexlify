import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const CDN_PREFIX = "cdn:status:";
const CDN_METRICS_PREFIX = "cdn:metrics:";

export type CdnEndpoint = {
  id: string;
  name: string;
  url: string;
  priority: number;
  isActive: boolean;
  region: string;
  maxBandwidthMbps: number;
};

export type CdnMetrics = {
  cdnId: string;
  latencyMs: number;
  bandwidthMbps: number;
  errorRate: number; // 0-1
  successRate: number; // 0-1
  lastChecked: number;
  score: number; // 0-100
};

export function calculateCdnScore(metrics: CdnMetrics): number {
  const latencyScore = Math.max(0, 100 - metrics.latencyMs / 10); // 10ms = 90 score
  const bandwidthScore = Math.min(100, (metrics.bandwidthMbps / 1000) * 100); // 1Gbps = 100
  const reliabilityScore = metrics.successRate * 100;
  return Math.round(
    latencyScore * 0.4 + bandwidthScore * 0.3 + reliabilityScore * 0.3
  );
}

export async function getCdnMetrics(cdnId: string): Promise<CdnMetrics | null> {
  return cacheGet<CdnMetrics>(`${CDN_METRICS_PREFIX}${cdnId}`);
}

export async function updateCdnMetrics(cdnId: string, metrics: Partial<CdnMetrics>): Promise<void> {
  const existing = await getCdnMetrics(cdnId);
  const updated: CdnMetrics = {
    cdnId,
    latencyMs: metrics.latencyMs ?? existing?.latencyMs ?? 0,
    bandwidthMbps: metrics.bandwidthMbps ?? existing?.bandwidthMbps ?? 0,
    errorRate: metrics.errorRate ?? existing?.errorRate ?? 0,
    successRate: metrics.successRate ?? existing?.successRate ?? 1,
    lastChecked: Date.now(),
    score: 0,
  };
  updated.score = calculateCdnScore(updated);
  await cacheSet(`${CDN_METRICS_PREFIX}${cdnId}`, updated, 60);
}

export async function selectBestCdn(streamId?: string): Promise<CdnEndpoint | null> {
  // Get all active CDN endpoints
  const endpoints = await prisma.cdnEndpoint.findMany({
    where: { isActive: true },
    orderBy: { priority: "asc" },
  });
  if (!endpoints.length) return null;

  // Get metrics for each CDN
  const scored = await Promise.all(
    endpoints.map(async (ep) => {
      const metrics = await getCdnMetrics(ep.id);
      const score = metrics?.score ?? 50; // Default score if no metrics
      return { endpoint: ep, score };
    })
  );

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.endpoint ?? null;
}

export async function probeCdnLatency(url: string): Promise<number> {
  const start = Date.now();
  try {
    await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Nexlify-CDN-Probe/1.0" },
    });
    return Date.now() - start;
  } catch {
    return 9999; // Very high latency on failure
  }
}

export async function probeAllCdns(): Promise<CdnMetrics[]> {
  const endpoints = await prisma.cdnEndpoint.findMany({
    where: { isActive: true },
  });

  const results: CdnMetrics[] = [];
  for (const ep of endpoints) {
    const latency = await probeCdnLatency(ep.url);
    const metrics: CdnMetrics = {
      cdnId: ep.id,
      latencyMs: latency,
      bandwidthMbps: 0,
      errorRate: latency > 5000 ? 1 : 0,
      successRate: latency < 5000 ? 1 : 0,
      lastChecked: Date.now(),
      score: 0,
    };
    metrics.score = calculateCdnScore(metrics);
    results.push(metrics);
    await updateCdnMetrics(ep.id, metrics);
  }

  return results;
}

export async function getCdnForStream(streamId: string): Promise<string | null> {
  const cached = await cacheGet<string>(`cdn:stream:${streamId}`);
  if (cached) return cached;

  const best = await selectBestCdn(streamId);
  if (best) {
    await cacheSet(`cdn:stream:${streamId}`, best.url, 300);
    return best.url;
  }
  return null;
}
