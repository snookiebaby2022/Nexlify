"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { PANEL_HTTP_PORT, STREAM_HTTP_PORT, STREAM_HTTPS_PORT } from "@/lib/server-ports";
import { IpWithFlag } from "@/components/ip-with-flag";
import { ServerActionsMenu } from "@/components/server-actions-menu";
import { ServerTreeView } from "@/components/server-tree-view";
import { parseServerPanelSettings } from "@/lib/server-panel-settings";

type ServerRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  maxClients: number;
  isActive: boolean;
  proxyId: string | null;
  domain: string | null;
  privateIp: string | null;
  rtmpPort: number | null;
  httpsPort?: number;
  bandwidthMbps: number | null;
  healthStatus: string;
  healthMessage: string | null;
  lastHealthAt: string | null;
  sortOrder?: number;
  panelSettings?: unknown;
  geoLbCountries?: unknown;
  geoLbIsps?: unknown;
  _count: { streams: number };
};

function serverRole(s: ServerRow, minSort: number): "main" | "lb" | "standard" {
  const { advanced } = parseServerPanelSettings(s.panelSettings);
  if (advanced.serverRole === "main" || advanced.serverRole === "lb") return advanced.serverRole;
  const hasGeo =
    (Array.isArray(s.geoLbCountries) && s.geoLbCountries.length > 0) ||
    (Array.isArray(s.geoLbIsps) && s.geoLbIsps.length > 0);
  if (hasGeo) return "lb";
  if ((s.sortOrder ?? 0) === minSort) return "main";
  return "standard";
}

function isServerOnline(s: ServerRow): boolean {
  return s.healthStatus === "online" || s.healthStatus === "healthy";
}

export default function AdminServersPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [proxies, setProxies] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [massAction, setMassAction] = useState("patch_active");
  const [massProxyId, setMassProxyId] = useState("");
  const [massMsg, setMassMsg] = useState("");
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");

  function load() {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers));
    fetch("/api/admin/proxies")
      .then((r) => r.json())
      .then((d) => setProxies(d.proxies ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function setProxy(serverId: string, proxyId: string) {
    await fetch("/api/admin/servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: serverId, proxyId: proxyId || null }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this server? Streams will be unassigned.")) return;
    await fetch(`/api/admin/servers?id=${id}`, { method: "DELETE" });
    load();
  }

  function toggleAll() {
    if (selected.size === servers.length) setSelected(new Set());
    else setSelected(new Set(servers.map((s) => s.id)));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function applyMass() {
    if (!selected.size) {
      setMassMsg("Select at least one server");
      return;
    }
    setMassMsg("");
    const ids = Array.from(selected);
    let body: Record<string, unknown> = { serverIds: ids };

    if (massAction === "patch_active") body = { ...body, action: "patch", isActive: true };
    else if (massAction === "patch_inactive") body = { ...body, action: "patch", isActive: false };
    else if (massAction === "patch_proxy") {
      body = { ...body, action: "patch", proxyId: massProxyId || null };
    } else {
      body = { ...body, action: massAction };
      if (massAction === "reboot_server" && !confirm(`Queue reboot for ${ids.length} server(s)?`)) return;
    }

    const res = await fetch("/api/admin/servers/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setMassMsg(res.ok ? (data.message ?? `Updated ${data.affected ?? data.queued ?? 0}`) : data.error);
    if (res.ok) {
      setSelected(new Set());
      load();
    }
  }

  async function serverAction(serverId: string, action: string) {
    setActionMsg((m) => ({ ...m, [serverId]: "…" }));
    const res = await fetch(`/api/admin/servers/${serverId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setActionMsg((m) => ({
      ...m,
      [serverId]: res.ok ? (data.note ?? "Queued") : (data.error ?? "Failed"),
    }));
    load();
  }

  const minSort =
    servers.length > 0 ? Math.min(...servers.map((s) => s.sortOrder ?? 0)) : 0;

  function healthColor(status: string) {
    if (status === "online" || status === "healthy") return "var(--success)";
    if (status === "offline" || status === "degraded") return "var(--danger)";
    return "var(--muted)";
  }

  function roleBadge(s: ServerRow) {
    const role = serverRole(s, minSort);
    const online = isServerOnline(s);
    const label = role === "main" ? "Main" : role === "lb" ? "LB" : "—";
    if (label === "—") return null;
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
        style={{
          background: online ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          color: online ? "#16a34a" : "#dc2626",
        }}
      >
        {label} {online ? "online" : "offline"}
      </span>
    );
  }

  function addressCell(s: ServerRow) {
    const httpPort = s.port || STREAM_HTTP_PORT;
    const httpsPort = s.httpsPort ?? STREAM_HTTPS_PORT;
    return (
      <div key={`addr-${s.id}`} className="text-sm">
        <IpWithFlag ip={`${s.host}:${httpPort}`} />
        {s.isActive && s.domain && (
          <div className="text-xs mt-0.5" style={{ color: "var(--accent)" }}>
            {s.domain}
            {httpsPort === 443 ? "" : `:${httpsPort}`}
          </div>
        )}
        {!s.isActive && (
          <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            disabled
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Manage Servers</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Stream edge HTTP on port {STREAM_HTTP_PORT}, panel on {PANEL_HTTP_PORT}, HTTPS on {STREAM_HTTPS_PORT}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/servers/install"
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: "var(--border)" }}
          >
            Install wizard
          </Link>
          <Link href="/admin/servers/add" className="text-sm px-3 py-2 rounded-md btn-positive">
            + Add Server
          </Link>
        </div>
      </div>

      <div
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          Mass edit ({selected.size} selected)
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <select
            className="panel-select rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
            value={massAction}
            onChange={(e) => setMassAction(e.target.value)}
          >
            <option value="patch_active">Set active</option>
            <option value="patch_inactive">Set inactive</option>
            <option value="patch_proxy">Set proxy</option>
            <option value="apply_config">Push config (agent)</option>
            <option value="nginx_reload">Reload nginx (agent)</option>
            <option value="clear_cache">Clear cache (agent)</option>
            <option value="reboot_server">Reboot server (agent)</option>
          </select>
          {massAction === "patch_proxy" && (
            <select
              className="panel-select rounded border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={massProxyId}
              onChange={(e) => setMassProxyId(e.target.value)}
            >
              <option value="">— No proxy —</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn-positive rounded px-4 py-2 text-sm cursor-pointer"
            onClick={applyMass}
          >
            Apply to selected
          </button>
          {massMsg && (
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {massMsg}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="text-sm px-3 py-1.5 rounded-md cursor-pointer"
          style={{
            background: viewMode === "tree" ? "var(--accent)" : "transparent",
            color: viewMode === "tree" ? "#fff" : "var(--muted)",
            border: viewMode === "tree" ? "none" : "1px solid var(--border)",
          }}
          onClick={() => setViewMode("tree")}
        >
          Server tree
        </button>
        <button
          type="button"
          className="text-sm px-3 py-1.5 rounded-md cursor-pointer"
          style={{
            background: viewMode === "table" ? "var(--accent)" : "transparent",
            color: viewMode === "table" ? "#fff" : "var(--muted)",
            border: viewMode === "table" ? "none" : "1px solid var(--border)",
          }}
          onClick={() => setViewMode("table")}
        >
          Table view
        </button>
      </div>

      {viewMode === "tree" ? (
        <ServerTreeView
          servers={servers}
          selectedIds={selected}
          onToggleSelect={toggle}
          onToggleGroup={(ids) => {
            const allOn = ids.every((id) => selected.has(id));
            const next = new Set(selected);
            if (allOn) ids.forEach((id) => next.delete(id));
            else ids.forEach((id) => next.add(id));
            setSelected(next);
          }}
        />
      ) : (
      <DataTable
        headers={[
          <label key="sel-all" className="flex items-center gap-1 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={servers.length > 0 && selected.size === servers.length}
              onChange={toggleAll}
            />
          </label>,
          "Name",
          "Role",
          "Address",
          "RTMP",
          "Health",
          "Proxy",
          "Streams",
          "Max",
          "Status",
          "Actions",
          "",
        ]}
        rows={servers.map((s) => [
          <input
            key={`sel-${s.id}`}
            type="checkbox"
            checked={selected.has(s.id)}
            onChange={() => toggle(s.id)}
          />,
          <div key={`n-${s.id}`}>
            <Link
              href={`/admin/servers/${s.id}/edit`}
              className="hover:underline font-medium"
              style={{ color: "var(--accent)" }}
            >
              {s.name}
            </Link>
          </div>,
          roleBadge(s) ?? "—",
          addressCell(s),
          s.rtmpPort ?? "—",
          <span key={`h-${s.id}`}>
            <span style={{ color: healthColor(s.healthStatus) }}>{s.healthStatus}</span>
            {s.lastHealthAt && (
              <span className="block text-xs" style={{ color: "var(--muted)" }}>
                {formatDateTime(s.lastHealthAt)}
              </span>
            )}
          </span>,
          <select
            key={`proxy-${s.id}`}
            className="panel-select rounded border px-2 py-1 text-xs"
            style={{ borderColor: "var(--border)" }}
            value={s.proxyId ?? ""}
            onChange={(e) => setProxy(s.id, e.target.value)}
          >
            <option value="">—</option>
            {proxies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>,
          s._count.streams,
          s.maxClients,
          s.isActive ? "Active" : "Off",
          <ServerActionsMenu
            key={`act-${s.id}`}
            serverId={s.id}
            onAction={(action) => serverAction(s.id, action)}
            onDelete={() => remove(s.id)}
            actionMsg={actionMsg[s.id]}
          />,
          "",
        ])}
      />
      )}
    </div>
  );
}
