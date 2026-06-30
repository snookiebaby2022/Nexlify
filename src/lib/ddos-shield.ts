import { getSettingGroup } from "@/lib/panel-settings";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

const COUNT_PREFIX = "ddos:cnt:";
const BLOCK_PREFIX = "ddos:block:";
const WINDOW_MS = 60_000;

const memoryCounts = new Map<string, { count: number; resetAt: number }>();
const memoryBlocks = new Map<string, number>();

function normalizeIp(ip: string): string {
  return ip.trim() || "unknown";
}

async function isBlocked(ip: string): Promise<boolean> {
  const key = normalizeIp(ip);
  const redis = getRedis();
  if (redis) {
    try {
      const blocked = await redis.get(`${BLOCK_PREFIX}${key}`);
      if (blocked) return true;
    } catch {
      /* fallback */
    }
  }
  const until = memoryBlocks.get(key);
  return until != null && until > Date.now();
}

async function setBlock(ip: string, minutes: number) {
  const key = normalizeIp(ip);
  const ttlSec = Math.max(60, minutes * 60);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.setex(`${BLOCK_PREFIX}${key}`, ttlSec, "1");
      return;
    } catch {
      /* fallback */
    }
  }
  memoryBlocks.set(key, Date.now() + ttlSec * 1000);
}

async function bumpCount(ip: string): Promise<number> {
  const key = normalizeIp(ip);
  const window = Math.floor(Date.now() / WINDOW_MS);
  const redis = getRedis();
  if (redis) {
    try {
      const rkey = `${COUNT_PREFIX}${key}:${window}`;
      const pipeline = redis.pipeline();
      pipeline.incr(rkey);
      pipeline.pexpire(rkey, WINDOW_MS);
      const results = await pipeline.exec();
      const count = results?.[0]?.[1];
      return typeof count === "number" ? count : Number(count) || 0;
    } catch {
      /* fallback */
    }
  }
  const memKey = `${key}:${window}`;
  const now = Date.now();
  const bucket = memoryCounts.get(memKey);
  if (!bucket || now > bucket.resetAt) {
    memoryCounts.set(memKey, { count: 1, resetAt: now + WINDOW_MS });
    return 1;
  }
  bucket.count++;
  return bucket.count;
}

/** Built-in DDoS shield — per-IP flood detection on playback/API paths. */
export async function checkDdosShield(
  ip: string | undefined
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!ip) return { ok: true };
  const security = await getSettingGroup("security");
  if (security.ddosShieldEnabled === false) return { ok: true };

  const perMin = Number(security.ddosShieldPerIpPerMin ?? 300);
  const blockMin = Number(security.ddosShieldBlockMinutes ?? 15);
  if (perMin <= 0) return { ok: true };

  if (await isBlocked(ip)) {
    return { ok: false, reason: "IP temporarily blocked by DDoS shield" };
  }

  const count = await bumpCount(ip);
  if (count > perMin) {
    await setBlock(ip, blockMin);
    await logDdosBlock(ip, count);
    return { ok: false, reason: "IP temporarily blocked by DDoS shield" };
  }

  return { ok: true };
}

async function logDdosBlock(ip: string, count: number) {
  try {
    await prisma.panelSetting.upsert({
      where: { key: `ddos:last_block:${ip}` },
      create: {
        key: `ddos:last_block:${ip}`,
        value: JSON.stringify({ at: new Date().toISOString(), count }),
      },
      update: {
        value: JSON.stringify({ at: new Date().toISOString(), count }),
      },
    });
  } catch {
    /* non-fatal */
  }
}

// Prune in-memory buckets periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryCounts) {
    if (now > v.resetAt) memoryCounts.delete(k);
  }
  for (const [k, until] of memoryBlocks) {
    if (now > until) memoryBlocks.delete(k);
  }
}, 60_000).unref?.();
