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
    const result = await redis.eval(
      ACQUIRE_LUA,
      1,
      slotSetKey(lineId),
      slotMember(opts?.clientIp, opts?.streamId),
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

export async function refreshConnSlot(
  lineId: string,
  opts?: { streamId?: string; clientIp?: string | null }
): Promise<void> {
  const redis = getSlotsRedis();
  if (!redis) return;
  try {
    if (!(await ensureSlotsRedisConnected())) return;
    const key = slotSetKey(lineId);
    const member = slotMember(opts?.clientIp, opts?.streamId);
    await redis.sadd(key, member);
    await redis.expire(key, SLOT_TTL_SEC);
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
