import { getRedis } from "./redis";

const memory = new Map<string, { exp: number; val: string }>();

function memGet(key: string) {
  const e = memory.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    memory.delete(key);
    return null;
  }
  return e.val;
}

function memSet(key: string, val: string, ttlSec: number) {
  memory.set(key, { val, exp: Date.now() + ttlSec * 1000 });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    try {
      if (redis.status !== "ready") await redis.connect();
      const raw = await redis.get(`nexlify:${key}`);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      /* fallback */
    }
  }
  const raw = memGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec = 60) {
  const raw = JSON.stringify(value);
  const redis = getRedis();
  if (redis) {
    try {
      if (redis.status !== "ready") await redis.connect();
      await redis.setex(`nexlify:${key}`, ttlSec, raw);
      return;
    } catch {
      /* fallback */
    }
  }
  memSet(key, raw, ttlSec);
}

export async function cacheDel(pattern: string) {
  const redis = getRedis();
  if (redis) {
    try {
      if (redis.status !== "ready") await redis.connect();
      const keys = await redis.keys(`nexlify:${pattern}`);
      if (keys.length) await redis.del(...keys);
    } catch {
      /* ignore */
    }
  }
  for (const k of [...memory.keys()]) {
    if (k.includes(pattern.replace("*", ""))) memory.delete(k);
  }
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await fn();
  await cacheSet(key, fresh, ttlSec);
  return fresh;
}
