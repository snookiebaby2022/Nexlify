import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";
import { allowedHostsFromEnv, normalizeDomain } from "@/lib/domains-host";
import { isLocalPanelHost } from "@/lib/panel-local-server";

const CDN_PREFIX = "cdn:status:";
const CDN_METRICS_PREFIX = "cdn:metrics:";
const OWNED_HOSTS_CACHE_KEY = "cdn:owned-hosts";
const OWNED_HOSTS_TTL_SEC = 120;

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

/** Rewrite an upstream stream URL onto the best CDN edge host (path + query preserved). */
export function rewriteUrlThroughCdn(streamUrl: string, cdnBase: string): string {
  try {
    const src = new URL(streamUrl);
    const cdn = new URL(cdnBase);
    if (!/^https?:$/i.test(cdn.protocol)) return streamUrl;
    src.protocol = cdn.protocol;
    src.host = cdn.host;
    const basePath = cdn.pathname.replace(/\/$/, "");
    if (basePath && basePath !== "/") {
      src.pathname = `${basePath}${src.pathname.startsWith("/") ? src.pathname : `/${src.pathname}`}`;
    }
    return src.toString();
  } catch {
    return streamUrl;
  }
}

function addHostToken(hosts: Set<string>, raw?: string | null) {
  const t = raw?.trim();
  if (!t) return;
  try {
    const h = new URL(t.includes("://") ? t : `https://${t}`).hostname.toLowerCase();
    if (h) hosts.add(normalizeDomain(h));
  } catch {
    const d = normalizeDomain(t);
    if (d) hosts.add(d);
  }
}

/**
 * Hosts we are allowed to front with Smart CDN (panel DNS / NIC / StreamServer domain).
 * Never includes arbitrary provider origins — rewriting those breaks live proxy + VOD redirects.
 */
export async function getOwnedPlaybackHosts(): Promise<Set<string>> {
  const cached = await cacheGet<string[]>(OWNED_HOSTS_CACHE_KEY);
  if (cached?.length) return new Set(cached);

  const hosts = new Set<string>(allowedHostsFromEnv().map((h) => normalizeDomain(h)));
  try {
    const servers = await prisma.streamServer.findMany({
      select: { host: true, domain: true },
      take: 500,
    });
    for (const s of servers) {
      addHostToken(hosts, s.host);
      addHostToken(hosts, s.domain);
    }
  } catch {
    /* DB optional during early boot */
  }

  const list = [...hosts].filter(Boolean);
  await cacheSet(OWNED_HOSTS_CACHE_KEY, list, OWNED_HOSTS_TTL_SEC);
  return new Set(list);
}

/** True when the stream URL host is this panel / an owned stream server (not a provider CDN). */
export function isOwnedPlaybackUrl(streamUrl: string, ownedHosts: Set<string>): boolean {
  try {
    const u = new URL(streamUrl);
    if (!/^https?:$/i.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (isLocalPanelHost(host)) return true;
    const norm = normalizeDomain(host);
    if (ownedHosts.has(norm) || ownedHosts.has(host)) return true;
    for (const owned of ownedHosts) {
      if (owned && (host === owned || host.endsWith(`.${owned}`))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Optionally front a stream URL with the best Smart CDN endpoint.
 * Only rewrites URLs whose host is owned by this panel — never provider/upstream hosts
 * (that previously rewrote pending:// and plex/provider IPs onto CF and broke apps).
 */
export async function applySmartCdnToUrl(streamId: string, streamUrl: string): Promise<string> {
  if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) return streamUrl;
  try {
    const owned = await getOwnedPlaybackHosts();
    if (!isOwnedPlaybackUrl(streamUrl, owned)) return streamUrl;
    const cdn = await getCdnForStream(streamId);
    if (!cdn) return streamUrl;
    // Already on a CDN edge — leave alone
    try {
      const cdnHost = new URL(cdn).hostname.toLowerCase();
      const srcHost = new URL(streamUrl).hostname.toLowerCase();
      if (cdnHost && srcHost === cdnHost) return streamUrl;
    } catch {
      /* continue */
    }
    const rewritten = rewriteUrlThroughCdn(streamUrl, cdn);
    return rewritten || streamUrl;
  } catch {
    return streamUrl;
  }
}
