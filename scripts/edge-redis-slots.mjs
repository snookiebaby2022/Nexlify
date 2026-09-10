/**
 * Shared Redis connection slots for iptv-edge-proxy (same keys/Lua as panel).
 * Prefer REDIS_SLOTS_URL (noeviction); falls back to REDIS_URL / IPTV_EDGE_REDIS_URL.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const SLOT_TTL_SEC = 90;
const ACQUIRE_LUA = `
local setKey = KEYS[1]
local member = ARGV[1]
local max = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if redis.call('SISMEMBER', setKey, member) == 1 then
  redis.call('EXPIRE', setKey, ttl)
  return 2
end
local n = redis.call('SCARD', setKey)
if max > 0 and n >= max then
  return 0
end
redis.call('SADD', setKey, member)
redis.call('EXPIRE', setKey, ttl)
return 1
`;

let redis = null;
let redisFailed = false;

const REDIS_SLOTS_URL = (
  process.env.REDIS_SLOTS_URL ||
  process.env.REDIS_URL ||
  process.env.IPTV_EDGE_REDIS_URL ||
  ""
).trim();

function getRedis() {
  if (redisFailed || !REDIS_SLOTS_URL) return null;
  if (redis) return redis;
  try {
    const Redis = require("ioredis");
    redis = new Redis(REDIS_SLOTS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", () => {
      redisFailed = true;
    });
    return redis;
  } catch {
    redisFailed = true;
    return null;
  }
}

export function edgeSlotsEnabled() {
  return Boolean(REDIS_SLOTS_URL) && !redisFailed;
}

function slotSetKey(lineId) {
  return `nexlify:conn:slots:${lineId}`;
}

function slotMember(clientIp, streamId) {
  return `${(clientIp || "anon").trim()}|${(streamId || "").trim()}`;
}

/**
 * @returns {"acquired"|"existing"|"denied"|"unavailable"}
 */
export async function edgeTryAcquireConnSlot(lineId, maxConnections, opts = {}) {
  if (!lineId || maxConnections <= 0) return "acquired";
  const client = getRedis();
  if (!client) return "unavailable";
  try {
    if (client.status !== "ready") await client.connect();
    const result = await client.eval(
      ACQUIRE_LUA,
      1,
      slotSetKey(lineId),
      slotMember(opts.clientIp, opts.streamId),
      String(maxConnections),
      String(SLOT_TTL_SEC)
    );
    const n = Number(result);
    if (n === 2) return "existing";
    if (n === 1) return "acquired";
    return "denied";
  } catch {
    return "unavailable";
  }
}
