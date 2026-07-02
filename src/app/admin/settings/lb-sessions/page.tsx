"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Server,
  Activity,
  Power,
  Eye,
  RotateCcw,
  Wifi,
  ArrowDownUp,
  ArrowUpDown,
  Clock,
  Users,
  Database,
  X,
  ChevronDown,
} from "lucide-react";

interface LbSession {
  id: string;
  sessionKey: string;
  lineUsername: string;
  streamName: string;
  serverName: string;
  deviceId: string;
  ipAddress: string;
  startedAt: string;
  lastSeenAt: string;
  bandwidthIn: number;
  bandwidthOut: number;
}

interface SessionStats {
  totalActive: number;
  totalBandwidthIn: number;
  totalBandwidthOut: number;
  perServer: Record<string, number>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const REFRESH_INTERVAL = 15000;

export default function LbSessionsPage() {
  const [sessions, setSessions] = useState<LbSession[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [serverFilter, setServerFilter] = useState<string>("ALL");
  const [actionMsg, setActionMsg] = useState("");
  const [processing, setProcessing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/admin/lb-sessions").then((r) => r.json()),
      fetch("/api/admin/lb-sessions/stats").then((r) => r.json()),
    ])
      .then(([data, s]) => {
        setSessions(data.sessions ?? []);
        setStats(s ?? null);
      })
      .catch(() => setError("Failed to load LB sessions."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const allServers = Array.from(new Set(sessions.map((s) => s.serverName))).sort();

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      s.sessionKey.toLowerCase().includes(q) ||
      s.lineUsername.toLowerCase().includes(q) ||
      s.streamName.toLowerCase().includes(q) ||
      s.serverName.toLowerCase().includes(q) ||
      s.ipAddress.toLowerCase().includes(q);
    const matchesServer = serverFilter === "ALL" || s.serverName === serverFilter;
    return matchesSearch && matchesServer;
  });

  async function endSession(id: string) {
    setProcessing(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/lb-sessions/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (res.ok) {
        setActionMsg("Session ended successfully.");
        load();
      } else {
        setActionMsg(j.error || "Failed to end session.");
      }
    } catch {
      setActionMsg("Network error.");
    } finally {
      setProcessing(false);
    }
  }

  const detail = detailId ? sessions.find((s) => s.id === detailId) : null;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Load Balancer Shared Sessions</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Real-time active sessions across load-balanced servers. Auto-refreshes every 15 seconds.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <span
            className="relative inline-flex h-5 w-9 rounded-full transition-colors"
            style={{ background: autoRefresh ? "var(--accent)" : "var(--border)" }}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
              style={{ transform: autoRefresh ? "translateX(1.15rem)" : "translateX(0.15rem)", marginTop: 2 }}
            />
          </span>
          Auto-refresh
        </label>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Active Sessions",
              value: stats.totalActive,
              icon: <Users className="w-5 h-5" />,
              color: "var(--accent)",
            },
            {
              label: "Bandwidth In",
              value: formatBytes(stats.totalBandwidthIn),
              icon: <ArrowDownUp className="w-5 h-5" />,
              color: "#22c55e",
            },
            {
              label: "Bandwidth Out",
              value: formatBytes(stats.totalBandwidthOut),
              icon: <ArrowUpDown className="w-5 h-5" />,
              color: "#fbbf24",
            },
            {
              label: "Servers",
              value: Object.keys(stats.perServer).length,
              icon: <Database className="w-5 h-5" />,
              color: "#6366f1",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border p-4 flex items-center gap-4"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="rounded-full p-2.5" style={{ background: `${s.color}22`, color: s.color }}>
                {s.icon}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  {s.label}
                </div>
                <div className="text-2xl font-bold" style={{ color: s.color }}>
                  {s.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {stats && Object.keys(stats.perServer).length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: "var(--muted)" }}>
            Per-Server Sessions
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.perServer).map(([server, count]) => (
              <button
                key={server}
                onClick={() => setServerFilter(serverFilter === server ? "ALL" : server)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: serverFilter === server ? "rgba(34,211,238,0.2)" : "rgba(255,255,255,0.04)",
                  color: serverFilter === server ? "var(--accent)" : "var(--muted)",
                  border: "1px solid var(--border)",
                }}
              >
                <Server className="w-3.5 h-3.5" />
                {server}: {count}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div
            className="flex items-center gap-2 rounded-lg border px-3 py-2 flex-1 max-w-md"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <Search className="w-4 h-4" style={{ color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="Search sessions..."
              className="bg-transparent outline-none text-sm w-full"
              style={{ color: "var(--text)" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative">
            <select
              className="appearance-none rounded-lg border px-3 py-2 pr-8 text-sm bg-transparent cursor-pointer"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
              value={serverFilter}
              onChange={(e) => setServerFilter(e.target.value)}
            >
              <option value="ALL">All Servers</option>
              {allServers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted)" }} />
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:opacity-80"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--muted)" }}
        >
          <RotateCcw className="w-4 h-4" />
          Refresh Now
        </button>
      </div>

      {actionMsg && (
        <div
          className="rounded-lg px-4 py-2 text-sm"
          style={{
            background: actionMsg.includes("error") || actionMsg.includes("failed") || actionMsg.includes("Network")
              ? "rgba(239,68,68,0.15)"
              : "rgba(34,197,94,0.15)",
            color: actionMsg.includes("error") || actionMsg.includes("failed") || actionMsg.includes("Network")
              ? "#ef4444"
              : "#22c55e",
          }}
        >
          {actionMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading sessions...</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-card)" }}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Session Key</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Line</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Stream</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Server</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>IP</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Started</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Last Seen</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--muted)" }}>Bandwidth</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                      No active sessions found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => (
                    <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 font-mono text-xs max-w-[8rem] truncate">{s.sessionKey}</td>
                      <td className="px-4 py-3 font-medium">{s.lineUsername}</td>
                      <td className="px-4 py-3">{s.streamName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                          <Server className="w-3.5 h-3.5" />
                          {s.serverName}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{s.ipAddress}</td>
                      <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{s.startedAt}</td>
                      <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{s.lastSeenAt}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-0.5 text-xs">
                          <span style={{ color: "#22c55e" }}>
                            <ArrowDownUp className="w-3 h-3 inline mr-0.5" />
                            {formatBytes(s.bandwidthIn)}
                          </span>
                          <span style={{ color: "#fbbf24" }}>
                            <ArrowUpDown className="w-3 h-3 inline mr-0.5" />
                            {formatBytes(s.bandwidthOut)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            disabled={processing}
                            onClick={() => endSession(s.id)}
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
                            style={{ background: "var(--btn-negative)", color: "#fff" }}
                            title="End Session"
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDetailId(detailId === s.id ? null : s.id)}
                            className="inline-flex items-center rounded px-2 py-1 text-xs border transition-colors hover:opacity-80"
                            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <div
          className="rounded-lg border p-5 space-y-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Session Details</h3>
            <button onClick={() => setDetailId(null)} className="text-xs" style={{ color: "var(--muted)" }}>
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>ID</span>
              <span className="font-mono">{detail.id}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Session Key</span>
              <span className="font-mono">{detail.sessionKey}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Line Username</span>
              <span>{detail.lineUsername}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Stream</span>
              <span>{detail.streamName}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Server</span>
              <span className="inline-flex items-center gap-1">
                <Server className="w-3.5 h-3.5" />
                {detail.serverName}
              </span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Device ID</span>
              <span className="font-mono">{detail.deviceId}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>IP Address</span>
              <span className="font-mono">{detail.ipAddress}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Started</span>
              <span>{detail.startedAt}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Last Seen</span>
              <span>{detail.lastSeenAt}</span>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-4">
              <div className="rounded border p-3 flex-1 min-w-[8rem]" style={{ borderColor: "var(--border)" }}>
                <div className="text-xs" style={{ color: "var(--muted)" }}>Bandwidth In</div>
                <div className="text-lg font-bold" style={{ color: "#22c55e" }}>{formatBytes(detail.bandwidthIn)}</div>
              </div>
              <div className="rounded border p-3 flex-1 min-w-[8rem]" style={{ borderColor: "var(--border)" }}>
                <div className="text-xs" style={{ color: "var(--muted)" }}>Bandwidth Out</div>
                <div className="text-lg font-bold" style={{ color: "#fbbf24" }}>{formatBytes(detail.bandwidthOut)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
