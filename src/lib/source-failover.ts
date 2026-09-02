import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getSettingGroup } from "@/lib/panel-settings";

const FAILOVER_PREFIX = "failover:attempts:";
const MAX_FAILOVER_ATTEMPTS = 3;
const FAILOVER_COOLDOWN_SEC = 300;
const FAILOVER_PROBE_TIMEOUT_MS = 4_000;

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

/** Backup URLs stay on the stream; playback uses them only when this is on. */
export async function isAutoSourceSwapEnabled(): Promise<boolean> {
  const [swap, fix] = await Promise.all([
    getSettingGroup("source-swap"),
    getSettingGroup("auto-fix"),
  ]);
  const swapOn = swap.sourceSwapEnabled === true && swap.sourceSwapOnFailure !== false;
  const fixOn = fix.autoFixEnabled === true && fix.autoFixSourceSwitch === true;
  return swapOn || fixOn;
}

export async function getFailoverKey(streamId: string): Promise<string> {
  return `${FAILOVER_PREFIX}${streamId}`;
}

export async function getActiveSource(streamId: string): Promise<FailoverResult> {
  if (!(await isAutoSourceSwapEnabled())) {
    return { url: "", source: "primary", attempts: 0 };
  }
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
    select: { streamUrl: true, backupUrl: true },
  });
  if (!stream) return null;
  const allUrls = [stream.streamUrl, stream.backupUrl].filter(
    (u): u is string => !!u && u !== primaryUrl
  );

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
  if (!(await isAutoSourceSwapEnabled())) {
    return { url: primaryUrl, source: "primary", attempts: 0 };
  }
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

export async function probeUpstream(url: string, timeoutMs: number = FAILOVER_PROBE_TIMEOUT_MS): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Nexlify-Probe/1.0", Accept: "*/*" },
    });
    if (res.ok) return true;
    // Some live providers reject HEAD but serve GET. Do one bounded range probe
    // instead of declaring a healthy source dead.
    if (res.status === 405 || res.status === 501) {
      const fallback = await fetch(url, {
        headers: { "User-Agent": "Nexlify-Probe/1.0", Range: "bytes=0-1023", Accept: "*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return fallback.ok || fallback.status === 206;
    }
    return false;
  } catch {
    return false;
  }
}
