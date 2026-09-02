import os from "node:os";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

export type CronLoadSnapshot = {
  load1: number;
  cpuCount: number;
  liveConnections: number;
  deferHeavy: boolean;
};

const SNAPSHOT_TTL_MS = 15_000;
let cachedSnapshot: { at: number; snap: CronLoadSnapshot } | null = null;

function loadDeferThreshold(cpuCount: number): number {
  const raw = Number(process.env.NEXLIFY_CRON_LOAD_DEFER);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return Math.max(4, cpuCount * 1.25);
}

function liveConnDeferThreshold(): number {
  const raw = Number(process.env.NEXLIFY_CRON_LIVE_CONN_DEFER);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 60;
}

/** Skip catalog warm / dead-link probes when the host is already busy with viewers or DB work. */
export async function getCronLoadSnapshot(): Promise<CronLoadSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now - cachedSnapshot.at < SNAPSHOT_TTL_MS) {
    return cachedSnapshot.snap;
  }

  const cpuCount = os.cpus().length || 1;
  const load1 = os.loadavg()[0] ?? 0;
  const staleBefore = new Date(now - 120_000);
  let liveConnections = 0;
  try {
    liveConnections = await prisma.liveConnection.count({
      where: { lastSeenAt: { gte: staleBefore } },
    });
  } catch {
    liveConnections = 0;
  }

  const deferHeavy =
    load1 >= loadDeferThreshold(cpuCount) || liveConnections >= liveConnDeferThreshold();

  const snap: CronLoadSnapshot = { load1, cpuCount, liveConnections, deferHeavy };
  cachedSnapshot = { at: now, snap };
  return snap;
}

const INTERVAL_KEY = "nexlify:cron:interval";

/** True when at least `minIntervalSec` has passed since the last run (shared across workers). */
export async function cronIntervalDue(job: string, minIntervalSec: number): Promise<boolean> {
  if (minIntervalSec <= 0) return true;
  const key = `${INTERVAL_KEY}:${job}`;
  const last = Number((await cacheGet<number>(key)) ?? 0);
  const now = Math.floor(Date.now() / 1000);
  if (last > 0 && now - last < minIntervalSec) return false;
  await cacheSet(key, now, Math.max(minIntervalSec * 2, 600));
  return true;
}
