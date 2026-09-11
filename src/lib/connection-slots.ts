import { getSlotsRedis, ensureSlotsRedisConnected } from "@/lib/redis";

const SLOT_TTL_SEC = 90;

/**
 * Atomic max-connection slots in Redis (XUI-style admit before splice).
 * Member = ip|streamId so same-device zaps refresh without consuming a new slot.
 * Returns: 1 = newly acquired, 2 = existing member refreshed, 0 = denied.
 */
const ACQUIRE_LUA = `
local setKey = KEYS[1]
local member = ARGV[1]
local max = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local function keepOnlyMember()
  if max ~= 1 then return end
  for _, existing in ipairs(redis.call('SMEMBERS', setKey)) do
    if existing ~= member then
      redis.call('SREM', setKey, existing)
    end
  end
end
if redis.call('SISMEMBER', setKey, member) == 1 then
  keepOnlyMember()
  redis.call('EXPIRE', setKey, ttl)
  return 2
end
local n = redis.call('SCARD', setKey)
if max > 0 and n >= max then
  -- Zap can admit the new stream before the old MPEG-TS socket closes.
  -- Same-IP reclaim first; maxConnections=1 also clears every other member
  -- (Cloudflare edge IPs often change between requests).
  local clientIp = ARGV[4]
  local prefix = clientIp .. '|'
  for _, existing in ipairs(redis.call('SMEMBERS', setKey)) do
    if string.sub(existing, 1, string.len(prefix)) == prefix then
      redis.call('SREM', setKey, existing)
      n = n - 1
    end
  end
  if max == 1 and n >= max then
    for _, existing in ipairs(redis.call('SMEMBERS', setKey)) do
      redis.call('SREM', setKey, existing)
      n = n - 1
    end
  end
  if n >= max then
    return 0
  end
end
redis.call('SADD', setKey, member)
keepOnlyMember()
redis.call('EXPIRE', setKey, ttl)
return 1
`;

const REFRESH_LUA = `
local setKey = KEYS[1]
local member = ARGV[1]
local ttl = tonumber(ARGV[2])
if redis.call('SISMEMBER', setKey, member) == 1 then
  redis.call('EXPIRE', setKey, ttl)
  return 1
end
return 0
`;

function slotSetKey(lineId: string) {
  return `nexlify:conn:slots:${lineId}`;
}

function slotMember(clientIp: string | null | undefined, streamId: string | null | undefined) {
  return `${(clientIp || "anon").trim()}|${(streamId || "").trim()}`;
}

export type ConnSlotResult = "acquired" | "existing" | "denied" | "unavailable";

/** Redis slot admit. `unavailable` = fall through to DB capacity. */
export async function tryAcquireConnSlot(
  lineId: string,
  maxConnections: number,
  opts?: { streamId?: string; clientIp?: string | null }
): Promise<ConnSlotResult> {
  if (maxConnections <= 0) return "acquired";
  const redis = getSlotsRedis();
  if (!redis) return "unavailable";
  try {
    if (!(await ensureSlotsRedisConnected())) return "unavailable";
    const clientIp = String(opts?.clientIp || "anon");
    const result = await redis.eval(
      ACQUIRE_LUA,
      1,
      slotSetKey(lineId),
      slotMember(clientIp, opts?.streamId),
      String(maxConnections),
      String(SLOT_TTL_SEC),
      clientIp
    );
    const n = Number(result);
    if (n === 2) return "existing";
    if (n === 1) return "acquired";
    return "denied";
  } catch {
    return "unavailable";
  }
}

export async function refreshConnSlot(
  lineId: string,
  opts?: { streamId?: string; clientIp?: string | null }
): Promise<void> {
  const redis = getSlotsRedis();
  if (!redis) return;
  try {
    if (!(await ensureSlotsRedisConnected())) return;
    // Never SADD here — a late pulse from the previous zap stream would
    // resurrect a second member on maxConnections=1 lines.
    await redis.eval(
      REFRESH_LUA,
      1,
      slotSetKey(lineId),
      slotMember(opts?.clientIp, opts?.streamId),
      String(SLOT_TTL_SEC)
    );
  } catch {
    /* ignore */
  }
}

export async function releaseConnSlot(
  lineId: string,
  opts?: { streamId?: string; clientIp?: string | null }
): Promise<void> {
  const redis = getSlotsRedis();
  if (!redis) return;
  try {
    if (!(await ensureSlotsRedisConnected())) return;
    await redis.srem(slotSetKey(lineId), slotMember(opts?.clientIp, opts?.streamId));
  } catch {
    /* ignore */
  }
}
