/** Ordered streaming-server pool: first id is primary, rest are overflow / failover. */

export function normalizeServerPool(ids: unknown, fallback?: string | null): string[] {
  const raw = Array.isArray(ids) ? ids : [];
  const extra = fallback ? [fallback] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...raw, ...extra]) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function serverPoolAssignment(ids: unknown, fallback?: string | null): {
  serverId: string | null;
  serverPoolIds: string[];
} {
  const serverPoolIds = normalizeServerPool(ids, fallback);
  return { serverId: serverPoolIds[0] ?? null, serverPoolIds };
}

export function parseStoredServerPool(pool: unknown, serverId?: string | null): string[] {
  return normalizeServerPool(pool, serverId);
}

export function assignmentFromBody(body: Record<string, unknown>): {
  serverId: string | null;
  serverPoolIds: string[];
} {
  if (body.serverIds !== undefined || body.serverPoolIds !== undefined) {
    return serverPoolAssignment(body.serverIds ?? body.serverPoolIds, body.serverId as string | null);
  }
  if (body.serverId !== undefined) {
    return serverPoolAssignment(body.serverId ? [String(body.serverId)] : [], null);
  }
  return { serverId: null, serverPoolIds: [] };
}

export function rotatePoolPrimary(pool: string[], primary: string): string[] {
  const id = primary.trim();
  if (!id) return normalizeServerPool(pool);
  return normalizeServerPool([id, ...pool]);
}

export function poolAllowsServer(pool: string[], serverId: string): boolean {
  if (!pool.length) return true;
  return pool.includes(serverId);
}

export function formatCombinedCapacityGbps(capMbpsList: number[]): string {
  const total = capMbpsList.reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0);
  if (total <= 0) return "capacity unknown";
  if (total >= 1000) {
    const gbps = total / 1000;
    return `~${gbps >= 10 ? gbps.toFixed(0) : gbps.toFixed(1)} Gbps`;
  }
  return `~${Math.round(total)} Mbps`;
}

export function formatHeadroom(usedMbps: number, capMbps: number, headroomPct: number): string {
  if (!(capMbps > 0)) return usedMbps > 0 ? `${Math.round(usedMbps)} used` : "—";
  return `${Math.round(usedMbps)} / ${Math.round(capMbps)} · ${Math.round(headroomPct)}% free`;
}
