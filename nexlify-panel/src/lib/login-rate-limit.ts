import { getSettingGroup } from "@/lib/panel-settings";

type Entry = { count: number; lockedUntil: number };

const byKey = new Map<string, Entry>();

export async function checkLoginRateLimit(ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const security = await getSettingGroup("security");
  const floodPerMin = Number(security.loginFloodPerMin ?? 0);
  const key = ip || "unknown";
  const now = Date.now();
  let entry = byKey.get(key);
  if (!entry) {
    entry = { count: 0, lockedUntil: 0 };
    byKey.set(key, entry);
  }
  if (entry.lockedUntil > now) {
    const mins = Math.ceil((entry.lockedUntil - now) / 60_000);
    return { ok: false, error: `Too many attempts. Try again in ${mins} minute(s).` };
  }
  if (floodPerMin > 0) {
    const windowKey = `${key}:${Math.floor(now / 60_000)}`;
    const flood = byKey.get(windowKey);
    if (flood && flood.count >= floodPerMin) {
      return { ok: false, error: "Login rate limit exceeded. Wait a minute and retry." };
    }
    const f = flood ?? { count: 0, lockedUntil: 0 };
    f.count += 1;
    byKey.set(windowKey, f);
  }
  return { ok: true };
}

export async function recordLoginFailure(ip: string) {
  const security = await getSettingGroup("security");
  const max = Number(security.maxLoginAttempts ?? 10);
  const lockMin = Number(security.lockoutMinutes ?? 15);
  const key = ip || "unknown";
  const now = Date.now();
  let entry = byKey.get(key);
  if (!entry) {
    entry = { count: 0, lockedUntil: 0 };
    byKey.set(key, entry);
  }
  if (entry.lockedUntil > now) return;
  entry.count += 1;
  if (entry.count >= max) {
    entry.lockedUntil = now + lockMin * 60_000;
    entry.count = 0;
  }
}

export function clearLoginFailures(ip: string) {
  byKey.delete(ip || "unknown");
}
