/**
 * Optional Redis-backed live-auth cache for iptv-edge-proxy (shared across LB workers).
 * Set REDIS_URL on the edge node — same as panel Redis when reachable from LB.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let redis = null;
let redisReady = false;
let redisFailed = false;

const REDIS_URL = (process.env.REDIS_URL || process.env.IPTV_EDGE_REDIS_URL || "").trim();
const KEY_PREFIX = (process.env.IPTV_EDGE_REDIS_PREFIX || "edge-auth:").trim();

function getRedis() {
  if (redisFailed || !REDIS_URL) return null;
  if (redis) return redis;
  try {
    const Redis = require("ioredis");
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", () => {
      redisFailed = true;
    });
    redisReady = true;
    return redis;
  } catch {
    redisFailed = true;
    return null;
  }
}

export function edgeRedisEnabled() {
  return Boolean(REDIS_URL) && !redisFailed;
}

export async function edgeRedisGetAuth(key) {
  const client = getRedis();
  if (!client) return null;
  try {
    if (!redisReady) await client.connect();
    const raw = await client.get(`${KEY_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.expires || parsed.expires <= Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function edgeRedisSetAuth(key, data, ttlMs) {
  const client = getRedis();
  if (!client || !data?.upstream) return;
  try {
    if (!redisReady) await client.connect();
    const payload = JSON.stringify({ expires: Date.now() + ttlMs, data });
    const sec = Math.max(5, Math.ceil(ttlMs / 1000));
    await client.set(`${KEY_PREFIX}${key}`, payload, "EX", sec);
  } catch {
    /* fall back to in-memory only */
  }
}

/** HLS segment byte cache (small hot segments served from Redis when enabled). */
export async function edgeRedisGetSeg(streamId, segName) {
  const client = getRedis();
  if (!client) return null;
  try {
    if (!redisReady) await client.connect();
    const buf = await client.getBuffer(`edge-hls:${streamId}:${segName}`);
    return buf?.length ? buf : null;
  } catch {
    return null;
  }
}

export async function edgeRedisSetSeg(streamId, segName, body, ttlSec = 8) {
  const client = getRedis();
  if (!client || !body?.length) return;
  try {
    if (!redisReady) await client.connect();
    await client.set(`edge-hls:${streamId}:${segName}`, body, "EX", ttlSec);
  } catch {
    /* ignore */
  }
}
