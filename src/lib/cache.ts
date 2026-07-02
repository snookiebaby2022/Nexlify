import { getRedis } from "./redis";
import type { Redis } from "ioredis";

const KEY_PREFIX = "nexlify:";
const SCAN_COUNT = 250;

const memory = new Map<string, { exp: number; val: string }>();
let memoryWarned = false;

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

function warnMemoryFallback() {
  if (memoryWarned) return;
  memoryWarned = true;
  console.warn(
    "[cache] Redis unavailable — falling back to in-memory cache. " +
      "This is unsafe for multi-instance / cluster deployments. " +
      "Ensure Redis is running before scaling to multiple instances."
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/** Glob-style match for in-memory keys (`*` = any substring). Prefix patterns auto-wildcard. */
function memoryKeyMatches(key: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const glob = pattern.includes("*") ? pattern : `${pattern}*`;
  const re = new RegExp(`^${escapeRegex(glob).replace(/\\\*/g, ".*")}$`);
  return re.test(key);
}

function redisMatchPattern(pattern: string): string {
  const body = pattern === "*" ? "*" : pattern.includes("*") ? pattern : `${pattern}*`;
  return `${KEY_PREFIX}${body}`;
}

async function ensureRedisReady(redis: NonNullable<ReturnType<typeof getRedis>>) {
  if (redis.status !== "ready") await redis.connect();
}

async function scanDeleteOnNode(redis: Redis, match: string): Promise<number> {
  let cursor = "0";
  let deleted = 0;

  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", match, "COUNT", SCAN_COUNT);
    cursor = next;
    if (!keys.length) continue;

    deleted += keys.length;
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.unlink(key);
    }
    await pipeline.exec();
  } while (cursor !== "0");

  return deleted;
}

async function redisDeleteByPattern(match: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  try {
    await ensureRedisReady(redis);

    if (redis instanceof (await import("ioredis")).Cluster) {
      const results = await Promise.all(
        redis.nodes("master").map((node) => scanDeleteOnNode(node, match)),
      );
      return results.reduce((sum, n) => sum + n, 0);
    }

    return await scanDeleteOnNode(redis, match);
  } catch {
    return 0;
  }
}

function memoryDeleteByPattern(pattern: string): number {
  let deleted = 0;
  for (const key of [...memory.keys()]) {
    if (memoryKeyMatches(key, pattern)) {
      memory.delete(key);
      deleted += 1;
    }
  }
  return deleted;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    try {
      await ensureRedisReady(redis);
      const raw = await redis.get(`${KEY_PREFIX}${key}`);
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
      await ensureRedisReady(redis);
      await redis.setex(`${KEY_PREFIX}${key}`, ttlSec, raw);
      return;
    } catch {
      /* fallback */
    }
  }
  warnMemoryFallback();
  memSet(key, raw, ttlSec);
}

export async function cacheDelExact(key: string) {
  const redis = getRedis();
  if (redis) {
    try {
      await ensureRedisReady(redis);
      await redis.unlink(`${KEY_PREFIX}${key}`);
    } catch {
      /* ignore */
    }
  }
  memory.delete(key);
}

/** Delete keys by prefix/glob (`*` wildcard). Uses SCAN — safe for production Redis. */
export async function cacheDel(pattern: string): Promise<number> {
  const [redisDeleted, memoryDeleted] = await Promise.all([
    redisDeleteByPattern(redisMatchPattern(pattern)),
    Promise.resolve(memoryDeleteByPattern(pattern)),
  ]);
  return redisDeleted + memoryDeleted;
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await fn();
  await cacheSet(key, fresh, ttlSec);
  return fresh;
}
