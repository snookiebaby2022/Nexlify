import Redis, { Cluster } from "ioredis";

type RedisClient = Redis | Cluster;

const globalRedis = globalThis as unknown as { redis: RedisClient | null };

function parseClusterNodes(raw: string) {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [host, portStr] = part.split(":");
      return { host, port: parseInt(portStr || "6379", 10) };
    });
}

function createClient() {
  const clusterNodes = process.env.REDIS_CLUSTER_NODES?.trim();
  if (clusterNodes) {
    try {
      const nodes = parseClusterNodes(clusterNodes);
      if (nodes.length) {
        const client = new Redis.Cluster(nodes, {
          redisOptions: { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 250 },
          lazyConnect: true,
        });
        client.on("error", () => {});
        return client;
      }
    } catch {
      return null;
    }
  }

  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 250,
      enableOfflineQueue: false,
    });
    client.on("error", () => {});
    return client;
  } catch {
    return null;
  }
}

export function getRedis() {
  if (!globalRedis.redis) globalRedis.redis = createClient();
  return globalRedis.redis;
}

export function redisModeFromEnv(): "cluster" | "single" | "memory" {
  if (process.env.REDIS_CLUSTER_NODES?.trim()) return "cluster";
  if (process.env.REDIS_URL?.trim()) return "single";
  return "memory";
}

export async function redisPing() {
  const r = getRedis();
  if (!r) return false;
  try {
    if (r.status !== "ready") await r.connect();
    const pong = await r.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/** Live Redis memory settings for Cache & Redis health UI. */
export async function redisMemoryHealth(): Promise<{
  ok: boolean;
  maxmemory: string;
  maxmemoryPolicy: string;
  usedMemory: string;
  healthy: boolean;
  hint: string;
} | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    if (r.status !== "ready") await r.connect();
    const [maxmemoryRaw, policy, info] = await Promise.all([
      r.config("GET", "maxmemory") as Promise<string[]>,
      r.config("GET", "maxmemory-policy") as Promise<string[]>,
      r.info("memory"),
    ]);
    const maxBytes = Number(maxmemoryRaw?.[1] ?? 0);
    const maxmemoryPolicy = String(policy?.[1] ?? "unknown");
    const usedMatch = info.match(/used_memory_human:(\S+)/);
    const usedMemory = usedMatch?.[1] ?? "?";
    const maxmemory =
      maxBytes <= 0
        ? "0 (unlimited)"
        : maxBytes >= 1024 * 1024 * 1024
          ? `${(maxBytes / (1024 * 1024 * 1024)).toFixed(1)}gb`
          : `${Math.round(maxBytes / (1024 * 1024))}mb`;
    const healthy = maxBytes > 0 && maxmemoryPolicy.includes("lru");
    return {
      ok: true,
      maxmemory,
      maxmemoryPolicy,
      usedMemory,
      healthy,
      hint: healthy
        ? "maxmemory + LRU eviction look correct."
        : "Set redis.conf maxmemory (e.g. 512mb) and maxmemory-policy allkeys-lru, then CONFIG REWRITE.",
    };
  } catch {
    return null;
  }
}
