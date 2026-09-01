import { cacheGet, cacheSet } from "@/lib/cache";
import { createHash } from "node:crypto";

const PREFIX = "stream:host-circuit:";
const HOST_CIRCUIT_TTL_SEC = 6 * 60 * 60;
const HOST_FAILURE_THRESHOLD = 5;

export type HostCircuit = {
  failures: number;
  openedAt: number | null;
  lastCheckedAt: number | null;
};

function hostKey(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    if (!host) return null;
    const hash = createHash("sha256").update(host).digest("base64url");
    return `${PREFIX}${hash}`;
  } catch {
    return null;
  }
}

export function emptyHostCircuit(): HostCircuit {
  return { failures: 0, openedAt: null, lastCheckedAt: null };
}

export async function getHostCircuit(url: string): Promise<HostCircuit> {
  const key = hostKey(url);
  if (!key) return emptyHostCircuit();
  return (await cacheGet<HostCircuit>(key)) ?? emptyHostCircuit();
}

export async function recordHostProbe(url: string, ok: boolean, now = Date.now()): Promise<HostCircuit> {
  const key = hostKey(url);
  if (!key) return emptyHostCircuit();
  const prev = (await cacheGet<HostCircuit>(key)) ?? emptyHostCircuit();
  const next: HostCircuit = {
    failures: ok ? 0 : prev.failures + 1,
    openedAt: ok ? null : prev.failures + 1 >= HOST_FAILURE_THRESHOLD ? now : prev.openedAt,
    lastCheckedAt: now,
  };
  await cacheSet(key, next, HOST_CIRCUIT_TTL_SEC);
  return next;
}

/** Skip probes to hosts that recently failed across many streams. */
export async function allowHostProbe(url: string, now = Date.now()): Promise<boolean> {
  const circuit = await getHostCircuit(url);
  if (!circuit.openedAt) return true;
  return now - circuit.openedAt >= 10 * 60_000;
}
