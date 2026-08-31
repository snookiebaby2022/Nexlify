import { cacheDelExact, cacheGet, cacheSet } from "@/lib/cache";
import { createHash } from "node:crypto";

export type CircuitState = "closed" | "open" | "half_open";

export type SourceCircuit = {
  state: CircuitState;
  failures: number;
  successes: number;
  openedAt: number | null;
  lastCheckedAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  latencyMs: number | null;
  bitrateKbps: number | null;
};

export type SourceCandidate = {
  url: string;
  priority?: number;
  state?: CircuitState;
  failures?: number;
  latencyMs?: number | null;
  bitrateKbps?: number | null;
};

const PREFIX = "stream:circuit:";
const CIRCUIT_TTL_SEC = 24 * 60 * 60;
const FAILURE_THRESHOLD = 3;
const RECOVERY_AFTER_MS = 5 * 60_000;

export const CIRCUIT_FAILURE_THRESHOLD = FAILURE_THRESHOLD;
export const CIRCUIT_RECOVERY_AFTER_MS = RECOVERY_AFTER_MS;

function key(streamId: string, url: string): string {
  const urlHash = createHash("sha256").update(url.trim()).digest("base64url");
  return `${PREFIX}${streamId}:${urlHash}`;
}

export function emptySourceCircuit(): SourceCircuit {
  return {
    state: "closed",
    failures: 0,
    successes: 0,
    openedAt: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastError: null,
    latencyMs: null,
    bitrateKbps: null,
  };
}

export async function getSourceCircuit(streamId: string, url: string): Promise<SourceCircuit> {
  return (await cacheGet<SourceCircuit>(key(streamId, url))) ?? emptySourceCircuit();
}

type SourceProbeResult = {
  ok: boolean;
  error?: string | null;
  latencyMs?: number | null;
  bitrateKbps?: number | null;
  now?: number;
};

/** Pure state transition used by recordSourceProbe and unit tests. */
export function applySourceProbe(
  prev: SourceCircuit,
  opts: SourceProbeResult
): SourceCircuit {
  const now = opts.now ?? Date.now();
  const next: SourceCircuit = {
    ...prev,
    lastCheckedAt: now,
    latencyMs: opts.latencyMs ?? prev.latencyMs,
    bitrateKbps: opts.bitrateKbps ?? prev.bitrateKbps,
  };

  if (opts.ok) {
    next.successes += 1;
    next.failures = 0;
    next.state = "closed";
    next.openedAt = null;
    next.lastSuccessAt = now;
    next.lastError = null;
  } else {
    next.failures += 1;
    next.lastError = opts.error?.trim() || "Source probe failed";
    if (prev.state === "open" || prev.state === "half_open" || next.failures >= FAILURE_THRESHOLD) {
      next.state = "open";
      next.openedAt = now;
    }
  }

  return next;
}

export async function recordSourceProbe(opts: SourceProbeResult & {
  streamId: string;
  url: string;
}): Promise<SourceCircuit> {
  const prev = await getSourceCircuit(opts.streamId, opts.url);
  const next = applySourceProbe(prev, opts);
  await cacheSet(key(opts.streamId, opts.url), next, CIRCUIT_TTL_SEC);
  return next;
}

export async function allowSourceProbe(streamId: string, url: string, now = Date.now()): Promise<boolean> {
  const circuit = await getSourceCircuit(streamId, url);
  if (circuit.state !== "open") return true;
  return Boolean(circuit.openedAt && now - circuit.openedAt >= RECOVERY_AFTER_MS);
}

export async function resetSourceCircuit(streamId: string, url: string): Promise<void> {
  await cacheDelExact(key(streamId, url));
}

/** Best verified candidate first; open circuits are excluded unless all candidates are open. */
export function rankSourceCandidates(candidates: SourceCandidate[]): SourceCandidate[] {
  if (candidates.length < 2) return candidates;
  const usable = candidates.filter((c) => c.state !== "open");
  const pool = usable.length ? usable : candidates;
  return [...pool].sort((a, b) => {
    const stateRank = (s?: CircuitState) => s === "closed" ? 0 : s === "half_open" ? 1 : 2;
    const stateDiff = stateRank(a.state) - stateRank(b.state);
    if (stateDiff) return stateDiff;
    const failureDiff = (a.failures ?? 0) - (b.failures ?? 0);
    if (failureDiff) return failureDiff;
    const latencyDiff = (a.latencyMs ?? Number.MAX_SAFE_INTEGER) - (b.latencyMs ?? Number.MAX_SAFE_INTEGER);
    if (latencyDiff) return latencyDiff;
    const bitrateDiff = (b.bitrateKbps ?? 0) - (a.bitrateKbps ?? 0);
    if (bitrateDiff) return bitrateDiff;
    return (a.priority ?? 0) - (b.priority ?? 0);
  });
}
