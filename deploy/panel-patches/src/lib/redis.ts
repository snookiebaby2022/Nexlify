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
          redisOptions: { maxRetriesPerRequest: 2, lazyConnect: true },
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
      maxRetriesPerRequest: 2,
      lazyConnect: true,
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
