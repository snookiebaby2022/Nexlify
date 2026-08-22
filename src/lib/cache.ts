import { getRedis } from "./redis";
import type { Redis } from "ioredis";
import { gunzipSync, gzipSync } from "node:zlib";

const KEY_PREFIX = "nexlify:";
const SCAN_COUNT = 250;
/** Compress Redis payloads above this size (Xtream catalog JSON). */
const COMPRESS_MIN_BYTES = 10_240;
const COMPRESS_PREFIX = "gz:";

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
  // Only call connect() when the client has been fully closed; other non-ready
  // states (connecting, reconnecting) manage their own lifecycle.
  if (redis.status === "end") await redis.connect();
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

function encodeCachePayload(raw: string): string {
  if (raw.length < COMPRESS_MIN_BYTES) return raw;
  try {
    return COMPRESS_PREFIX + gzipSync(Buffer.from(raw, "utf8")).toString("base64");
  } catch {
    return raw;
  }
}

function decodeCachePayload(stored: string): string {
  if (!stored.startsWith(COMPRESS_PREFIX)) return stored;
  try {
    return gunzipSync(Buffer.from(stored.slice(COMPRESS_PREFIX.length), "base64")).toString("utf8");
  } catch {
    return stored;
  }
}

function parseCached<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeCachePayload(raw)) as T;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    try {
      await ensureRedisReady(redis);
      const raw = await redis.get(`${KEY_PREFIX}${key}`);
      return parseCached<T>(raw);
    } catch {
      /* fallback */
    }
  }
  return parseCached<T>(memDecodeGet(key));
}

/** Batch read — one Redis MGET round-trip instead of N sequential GETs. */
export async function cacheMget<T>(keys: string[]): Promise<(T | null)[]> {
  if (!keys.length) return [];
  const redis = getRedis();
  if (redis) {
    try {
      await ensureRedisReady(redis);
      const prefixed = keys.map((k) => `${KEY_PREFIX}${k}`);
      const raws = await redis.mget(...prefixed);
      return raws.map((raw) => parseCached<T>(raw));
    } catch {
      /* fallback */
    }
  }
  return keys.map((k) => parseCached<T>(memDecodeGet(k)));
}

export async function cacheSet(key: string, value: unknown, ttlSec = 60) {
  const raw = encodeCachePayload(JSON.stringify(value));
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

function memDecodeGet(key: string): string | null {
  const raw = memGet(key);
  return raw ? decodeCachePayload(raw) : null;
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

const inFlight = new Map<string, Promise<unknown>>();

export async function cacheGetOrSet<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  // Thundering herd protection: if another request is already fetching, wait for it
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);

  const fresh = await promise;
  await cacheSet(key, fresh, ttlSec);
  return fresh;
}
