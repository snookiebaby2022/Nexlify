export type ServerTreeNode = {
  id: string;
  name: string;
  host?: string;
  proxyId: string | null;
  proxy?: { id: string; name: string } | null;
  isActive?: boolean;
  healthStatus?: string;
  _count?: { streams: number };
  port?: number;
};

export type ServerTreeGroup = {
  id: string;
  label: string;
  servers: ServerTreeNode[];
};

export function buildServerTreeGroups(servers: ServerTreeNode[]): ServerTreeGroup[] {
  const direct = servers.filter((s) => !s.proxyId);
  const byProxy = new Map<string, ServerTreeNode[]>();
  for (const s of servers) {
    if (!s.proxyId) continue;
    if (!byProxy.has(s.proxyId)) byProxy.set(s.proxyId, []);
    byProxy.get(s.proxyId)!.push(s);
  }

  const out: ServerTreeGroup[] = [];
  if (direct.length) {
    out.push({ id: "__direct__", label: "Direct / main servers", servers: direct });
  }

  const seenProxy = new Set<string>();
  for (const s of servers) {
    if (!s.proxy?.id || seenProxy.has(s.proxy.id)) continue;
    seenProxy.add(s.proxy.id);
    out.push({
      id: s.proxy.id,
      label: `Proxy: ${s.proxy.name}`,
      servers: byProxy.get(s.proxy.id) ?? [],
    });
  }

  const orphanProxy = servers.filter((s) => s.proxyId && !s.proxy);
  if (orphanProxy.length) {
    out.push({ id: "__orphan__", label: "Other servers", servers: orphanProxy });
  }

  return out;
}

export function serverHealthColor(status?: string) {
  if (status === "online" || status === "healthy") return "#22c55e";
  if (status === "offline" || status === "degraded") return "#ef4444";
  return "#94a3b8";
}
