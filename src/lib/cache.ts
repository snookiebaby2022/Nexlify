import { getRedis, ensureRedisConnected } from "./redis";
import type { Redis } from "ioredis";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const KEY_PREFIX = "nexlify:";
const SCAN_COUNT = 250;
/** Compress Redis payloads above this size (Xtream catalog JSON). */
const COMPRESS_MIN_BYTES = 10_240;
const COMPRESS_PREFIX = "gz:";

const memory = new Map<string, { exp: number; val: string }>();
let memoryWarned = false;
/** Never keep Xtream catalogs in the process Map — that is what OOM'd the panel worker. */
export const MEMORY_CACHE_MAX_BYTES = 256 * 1024;
const MEMORY_CACHE_MAX_KEYS = 2000;

function memGet(key: string) {
  const e = memory.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    memory.delete(key);
    return null;
  }
  return e.val;
}

export function memoryCacheWouldStore(serializedBytes: number): boolean {
  return serializedBytes <= MEMORY_CACHE_MAX_BYTES;
}

function memSet(key: string, val: string, ttlSec: number) {
  if (!memoryCacheWouldStore(val.length)) return;
  if (memory.size >= MEMORY_CACHE_MAX_KEYS) {
    const now = Date.now();
    for (const [k, e] of memory) {
      if (now > e.exp) memory.delete(k);
    }
    if (memory.size >= MEMORY_CACHE_MAX_KEYS) {
      const extra = [...memory.keys()].slice(0, 500);
      for (const k of extra) memory.delete(k);
    }
  }
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
  if (!(await ensureRedisConnected())) {
    throw new Error("redis not connected");
  }
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

async function encodeCachePayload(raw: string): Promise<string> {
  if (raw.length < COMPRESS_MIN_BYTES) return raw;
  try {
    const gz = await gzipAsync(Buffer.from(raw, "utf8"), { level: 3 });
    return COMPRESS_PREFIX + gz.toString("base64");
  } catch {
    return raw;
  }
}

async function decodeCachePayload(stored: string): Promise<string> {
  if (!stored.startsWith(COMPRESS_PREFIX)) return stored;
  try {
    const buf = await gunzipAsync(Buffer.from(stored.slice(COMPRESS_PREFIX.length), "base64"));
    return buf.toString("utf8");
  } catch {
    return stored;
  }
}

async function parseCached<T>(raw: string | null): Promise<T | null> {
  if (!raw) return null;
  try {
    return JSON.parse(await decodeCachePayload(raw)) as T;
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
      return await parseCached<T>(raw);
    } catch {
      /* fallback */
    }
  }
  return parseCached<T>(await memDecodeGet(key));
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
      return Promise.all(raws.map((raw) => parseCached<T>(raw)));
    } catch {
      /* fallback */
    }
  }
  return Promise.all(keys.map(async (k) => parseCached<T>(await memDecodeGet(k))));
}

export async function cacheSet(key: string, value: unknown, ttlSec = 60) {
  const raw = await encodeCachePayload(JSON.stringify(value));
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

async function memDecodeGet(key: string): Promise<string | null> {
  return memGet(key);
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

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim() || process.env.REDIS_CLUSTER_NODES?.trim());
}

export function isMultiWorkerPanel(): boolean {
  const raw = process.env.PANEL_INSTANCES ?? process.env.NEXLIFY_PANEL_INSTANCES ?? "1";
  return Math.max(1, Number(raw) || 1) > 1;
}

/** Multi-worker panels require Redis for auth, circuits, and session state. */
export function redisRequiredForCluster(): boolean {
  return isMultiWorkerPanel();
}
