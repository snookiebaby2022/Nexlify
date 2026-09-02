import { createHash } from "node:crypto";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getSettingGroup } from "@/lib/panel-settings";
import { cronMatchesNow } from "@/lib/backup-schedule";
import { allowHostProbe, recordHostProbe } from "@/lib/source-host-circuit";
import {
  allowSourceProbe,
  markSourceCircuitHalfOpen,
  recordSourceProbe,
} from "@/lib/source-circuit-breaker";
import { probeStreamUrl, type ProbeResult } from "@/lib/stream-probe-server";
import type { ProviderProbeOptions } from "@/lib/stream-provider-probe";

const PROBE_SLOT_KEY = "nexlify:probe:slots";
const PROBE_LAST_RUN_KEY = "nexlify:probe:dead-link:last-run";
const MAX_GLOBAL_PROBES = Number(process.env.NEXLIFY_PROBE_MAX_CONCURRENT || 10);
const PROBE_BUDGET_MS = Number(process.env.NEXLIFY_PROBE_BUDGET_MS || 45_000);

export function probeJitterMs(streamId: string, spreadMs = 60_000): number {
  const hash = createHash("sha256").update(streamId).digest();
  return hash[0] % Math.max(1, spreadMs);
}

export async function shouldRunDeadLinkProbe(now = new Date()): Promise<boolean> {
  const settings = await getSettingGroup("streams");
  if (!settings.autoFixDeadLinks || settings.deadLinkProbeEnabled === false) return false;
  const cron = String(settings.deadLinkProbeCron || "*/15 * * * *").trim();
  if (!cronMatchesNow(cron, now)) return false;
  const intervalMin = Math.max(1, Number(settings.autoFixDeadLinksIntervalMin ?? 15));
  const lastRun = Number((await cacheGet<number>(PROBE_LAST_RUN_KEY)) ?? 0);
  if (lastRun && Date.now() - lastRun < intervalMin * 60_000 - 5_000) return false;
  return true;
}

export async function markDeadLinkProbeRun(): Promise<void> {
  await cacheSet(PROBE_LAST_RUN_KEY, Date.now(), 24 * 60 * 60);
}

async function acquireProbeSlot(): Promise<boolean> {
  const current = Number((await cacheGet<number>(PROBE_SLOT_KEY)) ?? 0);
  if (current >= MAX_GLOBAL_PROBES) return false;
  await cacheSet(PROBE_SLOT_KEY, current + 1, 120);
  return true;
}

async function releaseProbeSlot(): Promise<void> {
  const current = Number((await cacheGet<number>(PROBE_SLOT_KEY)) ?? 0);
  await cacheSet(PROBE_SLOT_KEY, Math.max(0, current - 1), 120);
}

export async function probeStreamWithScheduler(opts: {
  streamId: string;
  url: string;
  fast?: boolean;
} & ProviderProbeOptions): Promise<{ probe: ProbeResult; skipped: boolean; reason?: string }> {
  const hostAllowed = await allowHostProbe(opts.url);
  if (!hostAllowed) {
    return {
      probe: { status: "offline", message: "Host circuit open — probe deferred" },
      skipped: true,
      reason: "host_circuit",
    };
  }
  const allowed = await allowSourceProbe(opts.streamId, opts.url);
  if (!allowed) {
    return {
      probe: { status: "offline", message: "Circuit open — probe deferred" },
      skipped: true,
      reason: "source_circuit",
    };
  }
  const slot = await acquireProbeSlot();
  if (!slot) {
    return {
      probe: { status: "offline", message: "Probe pool saturated" },
      skipped: true,
      reason: "pool_saturated",
    };
  }
  try {
    await markSourceCircuitHalfOpen(opts.streamId, opts.url);
    const probe = await probeStreamUrl(opts.url, {
      fast: opts.fast !== false,
      apiKey: opts.apiKey,
      apiToken: opts.apiToken,
      providerType: opts.providerType,
      remoteUsername: opts.remoteUsername,
      remotePassword: opts.remotePassword,
    });
    const ok = probe.status === "online" || probe.status === "degraded";
    await recordSourceProbe({
      streamId: opts.streamId,
      url: opts.url,
      ok,
      error: ok ? null : probe.message,
      latencyMs: probe.latencyMs,
      bitrateKbps: probe.bitrateKbps,
    });
    await recordHostProbe(opts.url, ok);
    return { probe, skipped: false };
  } finally {
    await releaseProbeSlot();
  }
}

export async function runProbeBatchWithinBudget<T>(
  items: T[],
  budgetMs: number,
  worker: (item: T) => Promise<void>
): Promise<{ processed: number; elapsedMs: number }> {
  const start = Date.now();
  let processed = 0;
  for (const item of items) {
    if (Date.now() - start >= budgetMs) break;
    const jitter = probeJitterMs(String((item as { id?: string }).id ?? processed), 250);
    if (jitter > 0) await new Promise((r) => setTimeout(r, Math.min(jitter, 250)));
    await worker(item);
    processed += 1;
  }
  return { processed, elapsedMs: Date.now() - start };
}

export const PROBE_SCHEDULER_BUDGET_MS = PROBE_BUDGET_MS;
