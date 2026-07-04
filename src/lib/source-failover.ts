import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const FAILOVER_PREFIX = "failover:attempts:";
const MAX_FAILOVER_ATTEMPTS = 3;
const FAILOVER_COOLDOWN_SEC = 300;

export type UpstreamSource = {
  url: string;
  priority: number;
  isActive: boolean;
  lastChecked: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
};

export type FailoverResult = {
  url: string;
  source: "primary" | "failover" | "cache";
  attempts: number;
};

export async function getFailoverKey(streamId: string): Promise<string> {
  return `${FAILOVER_PREFIX}${streamId}`;
}

export async function getActiveSource(streamId: string): Promise<FailoverResult> {
  const cached = await cacheGet<{ url: string; until: number }>(
    `failover:active:${streamId}`
  );
  if (cached && cached.until > Date.now()) {
    return { url: cached.url, source: "failover", attempts: 0 };
  }
  return { url: "", source: "primary", attempts: 0 };
}

export async function setActiveFailover(
  streamId: string,
  url: string,
  ttlSec: number = 300
): Promise<void> {
  await cacheSet(`failover:active:${streamId}`, {
    url,
    until: Date.now() + ttlSec * 1000,
  }, ttlSec);
}

export async function clearActiveFailover(streamId: string): Promise<void> {
  const { cacheDelExact } = await import("@/lib/cache");
  await cacheDelExact(`failover:active:${streamId}`);
}

export async function recordUpstreamFailure(
  streamId: string,
  url: string,
  error: string
): Promise<number> {
  const key = `failover:attempts:${streamId}:${Buffer.from(url).toString("base64url").slice(0, 16)}`;
  const attempts = (await cacheGet<number>(key) ?? 0) + 1;
  await cacheSet(key, attempts, FAILOVER_COOLDOWN_SEC);
  return attempts;
}

export async function resetUpstreamFailures(
  streamId: string,
  url: string
): Promise<void> {
  const { cacheDelExact } = await import("@/lib/cache");
  const key = `failover:attempts:${streamId}:${Buffer.from(url).toString("base64url").slice(0, 16)}`;
  await cacheDelExact(key);
}

export async function getUpstreamAttempts(
  streamId: string,
  url: string
): Promise<number> {
  const key = `failover:attempts:${streamId}:${Buffer.from(url).toString("base64url").slice(0, 16)}`;
  return (await cacheGet<number>(key)) ?? 0;
}

export async function findFailoverUrl(
  streamId: string,
  primaryUrl: string
): Promise<string | null> {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { sourceUrl: true, backupUrl: true, failoverUrls: true },
  });
  if (!stream) return null;
  const allUrls = [
    stream.sourceUrl,
    stream.backupUrl,
    ...(Array.isArray(stream.failoverUrls) ? stream.failoverUrls : []),
  ].filter((u): u is string => !!u && u !== primaryUrl);

  for (const url of allUrls) {
    const attempts = await getUpstreamAttempts(streamId, url);
    if (attempts < MAX_FAILOVER_ATTEMPTS) return url;
  }
  return null;
}

export async function executeFailover(
  streamId: string,
  primaryUrl: string,
  testUrl: (url: string) => Promise<boolean>
): Promise<FailoverResult> {
  const active = await getActiveSource(streamId);
  if (active.source === "failover" && active.url) {
    const stillWorks = await testUrl(active.url);
    if (stillWorks) return active;
    await clearActiveFailover(streamId);
  }

  const attempts1 = await recordUpstreamFailure(streamId, primaryUrl, "primary failed");
  if (attempts1 >= MAX_FAILOVER_ATTEMPTS) {
    const failoverUrl = await findFailoverUrl(streamId, primaryUrl);
    if (failoverUrl) {
      const works = await testUrl(failoverUrl);
      if (works) {
        await setActiveFailover(streamId, failoverUrl, FAILOVER_COOLDOWN_SEC);
        return { url: failoverUrl, source: "failover", attempts: attempts1 };
      }
      await recordUpstreamFailure(streamId, failoverUrl, "failover also failed");
    }
  }
  return { url: primaryUrl, source: "primary", attempts: attempts1 };
}

export async function probeUpstream(url: string, timeoutMs: number = 10000): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Nexlify-Probe/1.0" },
    });
    return res.ok || res.status === 405;
  } catch {
    return false;
  }
}
