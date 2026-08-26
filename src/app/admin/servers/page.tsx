"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { PANEL_HTTP_PORT, STREAM_HTTP_PORT, STREAM_HTTPS_PORT } from "@/lib/server-ports";
import { IpWithFlag } from "@/components/ip-with-flag";
import { ServerActionsMenu } from "@/components/server-actions-menu";
import {
  buildServerRoleContext,
  resolveServerRole,
  sortServersMainFirst,
} from "@/lib/ensure-main-server-online";
import { isServerHealthOnline } from "@/lib/server-tree";
import {
  Server,
  Activity,
  Globe,
  Wifi,
  WifiOff,
  AlertTriangle,
  Layers,
  Zap,
  Shield,
  HardDrive,
  ArrowUpDown,
} from "lucide-react";

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
  countryCode?: string | null;
  region?: string | null;
  bandwidthMbps: number | null;
  healthStatus: string;
  healthMessage: string | null;
  lastHealthAt: string | null;
  sortOrder?: number;
  panelSettings?: unknown;
  geoLbCountries?: unknown;
  geoLbIsps?: unknown;
  agentLastSeen?: string | null;
  agentVersion?: string | null;
  _count: { streams: number; lbSessions: number; healthChecks: number };
};

function isServerOnline(s: ServerRow): boolean {
  return isServerHealthOnline(s.healthStatus);
}

export default function AdminServersPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [proxies, setProxies] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [massAction, setMassAction] = useState("patch_active");
  const [massProxyId, setMassProxyId] = useState("");
  const [massMsg, setMassMsg] = useState("");
  const [moveFromId, setMoveFromId] = useState("");
  const [moveToId, setMoveToId] = useState("");
  const [moveTypes, setMoveTypes] = useState({ LIVE: true, MOVIE: true, SERIES: true });
  const [moveMsg, setMoveMsg] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  function load() {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(sortServersMainFirst(Array.isArray(d.servers) ? d.servers : [])));
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

  async function moveStreamsBetweenServers() {
    const types = (["LIVE", "MOVIE", "SERIES"] as const).filter((t) => moveTypes[t]);
    if (!moveFromId || !moveToId) {
      setMoveMsg("Select source and destination servers");
      return;
    }
    if (moveFromId === moveToId) {
      setMoveMsg("Source and destination must differ");
      return;
    }
    if (!types.length) {
      setMoveMsg("Select at least one content type");
      return;
    }
    const fromName = servers.find((s) => s.id === moveFromId)?.name ?? "source";
    const toName = servers.find((s) => s.id === moveToId)?.name ?? "destination";
    if (
      !confirm(
        `Move all ${types.join(", ")} streams from ${fromName} to ${toName}? This cannot be undone in one click.`
      )
    ) {
      return;
    }
    setMoveBusy(true);
    setMoveMsg("");
    const res = await fetch("/api/admin/servers/move-streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromServerId: moveFromId, toServerId: moveToId, types }),
    });
    const data = await res.json();
    setMoveBusy(false);
    setMoveMsg(res.ok ? (data.message ?? `Moved ${data.moved ?? 0}`) : (data.error ?? "Move failed"));
    if (res.ok) load();
  }

  async function serverAction(serverId: string, action: string) {
    setActionMsg((m) => ({ ...m, [serverId]: "…" }));
    if (action === "enable_server" || action === "disable_server") {
      const res = await fetch("/api/admin/servers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: serverId, isActive: action === "enable_server" }),
      });
      const data = await res.json();
      setActionMsg((m) => ({ ...m, [serverId]: res.ok ? "Updated" : (data.error ?? "Failed") }));
      load();
      return;
    }
    const res = await fetch(`/api/admin/servers/${serverId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    let msg = res.ok ? (data.note ?? "Queued") : (data.error ?? "Failed");
    if (res.ok && data.agentToken) {
      msg = `Token: ${data.agentToken}`;
    }
    setActionMsg((m) => ({ ...m, [serverId]: msg }));
    load();
  }

  const roleCtx = buildServerRoleContext(servers);

  const totalServers = servers.length;
  const onlineServers = servers.filter((s) => isServerOnline(s)).length;
  const offlineServers = totalServers - onlineServers;
  const totalStreams = servers.reduce((sum, s) => sum + (s._count?.streams ?? 0), 0);
  const lbServers = servers.filter((s) => resolveServerRole(s, roleCtx) === "lb").length;
  const mainServer = servers.find((s) => resolveServerRole(s, roleCtx) === "main");

  function healthColor(status: string) {
    if (status === "online" || status === "healthy") return "var(--success)";
    if (status === "offline" || status === "degraded") return "var(--danger)";
    return "var(--muted)";
  }

  function roleBadge(s: ServerRow) {
    const role = resolveServerRole(s, roleCtx);
    const online = isServerOnline(s);
    const unknown = !online && !["offline", "degraded", "down"].includes(String(s.healthStatus ?? "").toLowerCase());
    const state = online ? "Online" : unknown ? "Unknown" : "Offline";
    const label = role === "main" ? "Main" : role === "lb" ? "LB" : "Standard";
    const tone = online
      ? role === "main"
        ? { bg: "rgba(168,85,247,0.15)", color: "#a855f7", border: "rgba(168,85,247,0.3)" }
        : role === "lb"
          ? { bg: "rgba(34,197,94,0.15)", color: "#16a34a", border: "rgba(34,197,94,0.3)" }
          : { bg: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "rgba(59,130,246,0.2)" }
      : unknown
        ? { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", border: "rgba(148,163,184,0.35)" }
        : { bg: "rgba(239,68,68,0.15)", color: "#dc2626", border: "rgba(239,68,68,0.3)" };
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-1 rounded-md"
        style={{
          background: tone.bg,
          color: tone.color,
          border: `1px solid ${tone.border}`,
        }}
      >
        {role === "main" && <Shield size={10} />}
        {role === "lb" && <ArrowUpDown size={10} />}
        {role === "standard" && <Server size={10} />}
        {label} · {state}
      </span>
    );
  }

  function addressCell(s: ServerRow) {
    const httpPort = s.port || STREAM_HTTP_PORT;
    const httpsPort = s.httpsPort ?? STREAM_HTTPS_PORT;
    return (
      <div key={`addr-${s.id}`} className="text-sm">
        <IpWithFlag ip={s.host} countryCode={s.countryCode} showCode />
        <span className="text-[10px] ml-1" style={{ color: "var(--muted)" }}>
          :{httpPort}
        </span>
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

  function StatCard({
    icon,
    label,
    value,
    color,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: string;
  }) {
    return (
      <div
        className="rounded-xl border p-4 flex items-center gap-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}15`, color }}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            {label}
          </div>
        </div>
      </div>
    );
  }

  function ServerCard({ s }: { s: ServerRow }) {
    const online = isServerOnline(s);
    const role = resolveServerRole(s, roleCtx);
    const streamCount = s._count?.streams ?? 0;
    const lbCount = s._count?.lbSessions ?? 0;
    return (
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          borderColor: online ? "var(--border)" : "rgba(239,68,68,0.3)",
          background: "var(--bg-card)",
        }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: online ? "#22c55e" : "#ef4444",
                boxShadow: online ? "0 0 8px #22c55e" : "0 0 8px #ef4444",
              }}
            />
            <Link
              href={`/admin/servers/${s.id}/edit`}
              className="font-semibold text-sm hover:underline"
              style={{ color: "var(--accent)" }}
            >
              {s.name}
            </Link>
            {roleBadge(s)}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="cursor-pointer"
            />
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>Host</span>
            {addressCell(s)}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>Health</span>
            <span style={{ color: healthColor(s.healthStatus) }} className="font-medium">
              {s.healthStatus}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>Streams</span>
            <span className="font-medium">{streamCount}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>Max Clients</span>
            <span className="font-medium">{s.maxClients.toLocaleString()}</span>
          </div>
          {s.bandwidthMbps && (
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--muted)" }}>Bandwidth</span>
              <span className="font-medium">{s.bandwidthMbps} Mbps</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>Proxy</span>
            <select
              className="panel-select rounded border px-2 py-1 text-xs cursor-pointer"
              style={{ borderColor: "var(--border)" }}
              value={s.proxyId ?? ""}
              onChange={(e) => setProxy(s.id, e.target.value)}
            >
              <option value="">None</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="pt-2 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--border)" }}>
            <ServerActionsMenu
              serverId={s.id}
              isActive={s.isActive}
              onAction={(action) => serverAction(s.id, action)}
              onDelete={() => remove(s.id)}
              actionMsg={actionMsg[s.id]}
            />
          </div>
        </div>
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
          <button
            type="button"
            onClick={async () => {
              setMassMsg("Testing servers…");
              const res = await fetch("/api/admin/servers/test", { method: "POST" });
              const data = await res.json();
              setMassMsg(data.message ?? `Tested ${data.results?.length ?? 0} servers`);
              load();
            }}
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: "var(--border)" }}
          >
            Test All Servers
          </button>
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

      {/* Server Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<Server size={18} />}
          label="Total Servers"
          value={totalServers}
          color="#3b82f6"
        />
        <StatCard
          icon={<Wifi size={18} />}
          label="Online"
          value={onlineServers}
          color="#22c55e"
        />
        <StatCard
          icon={<WifiOff size={18} />}
          label="Offline"
          value={offlineServers}
          color="#ef4444"
        />
        <StatCard
          icon={<Layers size={18} />}
          label="Total Streams"
          value={totalStreams.toLocaleString()}
          color="#a855f7"
        />
        <StatCard
          icon={<Globe size={18} />}
          label="Load Balancers"
          value={lbServers}
          color="#f59e0b"
        />
      </div>

      {/* Main Server Info */}
      {mainServer && (
        <div
          id="main-server"
          className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3"
          style={{
            borderColor: "rgba(168,85,247,0.3)",
            background: "linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(59,130,246,0.05) 100%)",
          }}
        >
          <div className="flex items-center gap-3">
            <Shield size={20} style={{ color: "#a855f7" }} />
            <div>
              <p className="text-sm font-medium">Main Server</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {mainServer.name} ({mainServer.host}:{mainServer.port}) — Primary entry point for all traffic
              </p>
            </div>
          </div>
          <Link
            href={`/admin/servers/${mainServer.id}/edit`}
            className="text-xs px-3 py-1.5 rounded-md border"
            style={{ borderColor: "rgba(168,85,247,0.4)", color: "#a855f7" }}
          >
            Change main server
          </Link>
        </div>
      )}

      <div
        className="rounded-lg border p-4 text-sm space-y-2"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <h3 className="font-semibold" style={{ color: "var(--accent)" }}>ℹ️ Server roles explained</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[var(--muted)] text-xs">
          <p>
            <strong style={{ color: "#a855f7" }}>Main</strong> — Primary server (lowest sort order). All traffic routes here unless geo-LB rules apply.
          </p>
          <p>
            <strong style={{ color: "#22c55e" }}>LB</strong> — Load balancer with geo or ISP rules. Distributes traffic across regions.
          </p>
          <p>
            <strong style={{ color: "#3b82f6" }}>Standard</strong> — Regular streaming server. Receives traffic when assigned to streams.
          </p>
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

      <div
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          Move streams between servers
        </h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Reassign all live channels, movies, and/or series from one server to another.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm block">
            <span className="block mb-1 text-xs" style={{ color: "var(--muted)" }}>From server</span>
            <select
              className="panel-select rounded border px-3 py-2 text-sm min-w-[180px]"
              style={{ borderColor: "var(--border)" }}
              value={moveFromId}
              onChange={(e) => setMoveFromId(e.target.value)}
            >
              <option value="">— Select —</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s._count?.streams ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm block">
            <span className="block mb-1 text-xs" style={{ color: "var(--muted)" }}>To server</span>
            <select
              className="panel-select rounded border px-3 py-2 text-sm min-w-[180px]"
              style={{ borderColor: "var(--border)" }}
              value={moveToId}
              onChange={(e) => setMoveToId(e.target.value)}
            >
              <option value="">— Select —</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3 items-center text-sm pb-2">
            {(["LIVE", "MOVIE", "SERIES"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={moveTypes[t]}
                  onChange={(e) => setMoveTypes((prev) => ({ ...prev, [t]: e.target.checked }))}
                />
                {t === "LIVE" ? "Live" : t === "MOVIE" ? "Movies" : "Series"}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn-positive rounded px-4 py-2 text-sm cursor-pointer disabled:opacity-60"
            disabled={moveBusy}
            onClick={moveStreamsBetweenServers}
          >
            {moveBusy ? "Moving…" : "Move content"}
          </button>
          {moveMsg && (
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {moveMsg}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
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
        <button
          type="button"
          className="text-sm px-3 py-1.5 rounded-md cursor-pointer"
          style={{
            background: viewMode === "cards" ? "var(--accent)" : "transparent",
            color: viewMode === "cards" ? "#fff" : "var(--muted)",
            border: viewMode === "cards" ? "none" : "1px solid var(--border)",
          }}
          onClick={() => setViewMode("cards")}
        >
          Card view
        </button>
      </div>

      {viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {servers.map((s) => (
            <ServerCard key={s.id} s={s} />
          ))}
          {servers.length === 0 && (
            <p className="col-span-full text-sm p-4" style={{ color: "var(--muted)" }}>
              No streaming servers yet.{" "}
              <Link href="/admin/servers/add" className="underline" style={{ color: "var(--accent)" }}>
                Add a server
              </Link>
            </p>
          )}
        </div>
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
            isActive={s.isActive}
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
