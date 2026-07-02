import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { getRedis } from "@/lib/redis";

type Entry = { count: number; lockedUntil: number };

const RL_PREFIX = "login_rl:";
const FLOOD_PREFIX = "login_flood:";
const FLOOD_WINDOW_MS = 60_000;

async function readEntry(key: string): Promise<Entry> {
  const row = await prisma.panelSetting.findUnique({ where: { key: RL_PREFIX + key } });
  if (!row?.value) return { count: 0, lockedUntil: 0 };
  try {
    const parsed = JSON.parse(row.value) as Entry;
    return {
      count: Number(parsed.count) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

async function writeEntry(key: string, entry: Entry) {
  await prisma.panelSetting.upsert({
    where: { key: RL_PREFIX + key },
    create: { key: RL_PREFIX + key, value: JSON.stringify(entry) },
    update: { value: JSON.stringify(entry) },
  });
}

async function bumpFloodCountRedis(key: string, window: number): Promise<number> {
  const redis = getRedis();
  if (!redis) return -1;
  const rkey = `${FLOOD_PREFIX}${key}:${window}`;
  try {
    const pipeline = redis.pipeline();
    pipeline.incr(rkey);
    pipeline.pexpire(rkey, FLOOD_WINDOW_MS);
    const results = await pipeline.exec();
    if (!results || !results[0]) return -1;
    const count = results[0][1];
    return typeof count === "number" ? count : Number(count) || -1;
  } catch {
    return -1;
  }
}

async function bumpFloodCountDb(key: string, window: number): Promise<number> {
  const settingKey = `${FLOOD_PREFIX}${key}:${window}`;
  // Atomic increment using raw SQL to avoid read-modify-write race
  const result = await prisma.$executeRaw`
    INSERT INTO "PanelSetting" (key, value)
    VALUES (${settingKey}, '1')
    ON CONFLICT (key) DO UPDATE SET value = CAST((CAST("PanelSetting".value AS INTEGER) + 1) AS TEXT)
    WHERE "PanelSetting".key = ${settingKey}
  `;
  // Read back the final value
  const row = await prisma.panelSetting.findUnique({ where: { key: settingKey }, select: { value: true } });
  return row ? Number(row.value) || 0 : result ? 1 : 0;
}

async function bumpFloodCount(key: string, window: number): Promise<number> {
  // Prefer Redis (fast, atomic, multi-instance safe)
  const redisCount = await bumpFloodCountRedis(key, window);
  if (redisCount >= 0) return redisCount;
  // Fallback to DB atomic increment
  return bumpFloodCountDb(key, window);
}

export async function checkLoginRateLimit(
  ip: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const security = await getSettingGroup("security");
  const floodPerMin = Number(security.loginFloodPerMin ?? 0);
  const key = ip || "unknown";
  const now = Date.now();
  const entry = await readEntry(key);

  if (entry.lockedUntil > now) {
    const mins = Math.ceil((entry.lockedUntil - now) / 60_000);
    return { ok: false, error: `Too many attempts. Try again in ${mins} minute(s).` };
  }

  if (floodPerMin > 0) {
    const window = Math.floor(now / 60_000);
    const floodCount = await bumpFloodCount(key, window);
    if (floodCount > floodPerMin) {
      return { ok: false, error: "Login rate limit exceeded. Wait a minute and retry." };
    }
  }

  return { ok: true };
}

export async function recordLoginFailure(ip: string) {
  const security = await getSettingGroup("security");
  const max = Number(security.maxLoginAttempts ?? 10);
  const lockMin = Number(security.lockoutMinutes ?? 15);
  const key = ip || "unknown";
  const now = Date.now();
  const entry = await readEntry(key);

  if (entry.lockedUntil > now) return;

  entry.count += 1;
  if (entry.count >= max) {
    entry.lockedUntil = now + lockMin * 60_000;
    entry.count = 0;
  }

  await writeEntry(key, entry);
}

export async function clearLoginFailures(ip: string) {
  const key = ip || "unknown";
  await prisma.panelSetting.deleteMany({
    where: { key: { in: [RL_PREFIX + key] } },
  });
}
