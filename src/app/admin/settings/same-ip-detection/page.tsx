"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Shield,
  ShieldAlert,
  Ban,
  Power,
  Bell,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Clock,
  Globe,
  Activity,
  Filter,
  ChevronDown,
  Eye,
  XCircle,
} from "lucide-react";

interface SameIpDetection {
  id: string;
  ipAddress: string;
  lineUsername: string;
  concurrentLines: number;
  detectedAt: string;
  autoAction: "NONE" | "BAN" | "DISABLE" | "NOTIFY";
  actionTaken: boolean;
  status: "OPEN" | "RESOLVED" | "IGNORED";
}

interface IpStats {
  totalToday: number;
  autoActionsTriggered: number;
  pendingResolutions: number;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  NONE: <Shield className="w-3.5 h-3.5" />,
  BAN: <Ban className="w-3.5 h-3.5" />,
  DISABLE: <Power className="w-3.5 h-3.5" />,
  NOTIFY: <Bell className="w-3.5 h-3.5" />,
};

const STATUS_STYLES: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  OPEN: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  RESOLVED: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  IGNORED: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", icon: <Shield className="w-3.5 h-3.5" /> },
};

export default function SameIpDetectionPage() {
  const [detections, setDetections] = useState<SameIpDetection[]>([]);
  const [stats, setStats] = useState<IpStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [actionMsg, setActionMsg] = useState("");
  const [processing, setProcessing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/admin/same-ip-detections").then((r) => r.json()),
      fetch("/api/admin/same-ip-detections/stats").then((r) => r.json()),
    ])
      .then(([data, s]) => {
        setDetections(data.detections ?? []);
        setStats(s ?? null);
      })
      .catch(() => setError("Failed to load same-IP detections."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = detections.filter((d) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      d.ipAddress.toLowerCase().includes(q) ||
      d.lineUsername.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "ALL" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function doAction(action: "ban" | "disable" | "notify" | "resolve", id: string) {
    setProcessing(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/same-ip-detections/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const j = await res.json();
      if (res.ok) {
        setActionMsg(
          `${action === "ban" ? "Banned" : action === "disable" ? "Disabled" : action === "notify" ? "Notified admin" : "Marked resolved"}.`
        );
        load();
      } else {
        setActionMsg(j.error || "Action failed.");
      }
    } catch {
      setActionMsg("Network error.");
    } finally {
      setProcessing(false);
    }
  }

  const detail = detailId ? detections.find((d) => d.id === detailId) : null;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Same-IP / Multi-Login Detection</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Detect and manage concurrent logins from the same IP address. Auto-actions and manual resolution.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Detections Today",
              value: stats.totalToday,
              icon: <Globe className="w-5 h-5" />,
              color: "var(--accent)",
            },
            {
              label: "Auto-Actions Triggered",
              value: stats.autoActionsTriggered,
              icon: <Activity className="w-5 h-5" />,
              color: "#fbbf24",
            },
            {
              label: "Pending Resolutions",
              value: stats.pendingResolutions,
              icon: <AlertTriangle className="w-5 h-5" />,
              color: "#ef4444",
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

      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div
            className="flex items-center gap-2 rounded-lg border px-3 py-2 flex-1 max-w-md"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <Search className="w-4 h-4" style={{ color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="Search by IP or line username..."
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
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
              <option value="IGNORED">Ignored</option>
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
          Refresh
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
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading detections...</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-card)" }}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>IP Address</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Line Username</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Concurrent</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Detected</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Auto Action</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Status</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                      No detections found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => {
                    const ss = STATUS_STYLES[d.status];
                    return (
                      <tr key={d.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-3 font-mono text-xs">{d.ipAddress}</td>
                        <td className="px-4 py-3 font-medium">{d.lineUsername}</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center justify-center rounded-full w-6 h-6 text-xs font-bold"
                            style={{ background: d.concurrentLines > 2 ? "rgba(239,68,68,0.2)" : "rgba(251,191,36,0.2)", color: d.concurrentLines > 2 ? "#ef4444" : "#fbbf24" }}
                          >
                            {d.concurrentLines}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{d.detectedAt}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                            {ACTION_ICONS[d.autoAction]}
                            {d.autoAction}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{ background: ss.bg, color: ss.color }}
                          >
                            {ss.icon}
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              disabled={processing}
                              onClick={() => doAction("ban", d.id)}
                              className="inline-flex items-center rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
                              style={{ background: "var(--btn-negative)", color: "#fff" }}
                              title="Ban Line"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={processing}
                              onClick={() => doAction("disable", d.id)}
                              className="inline-flex items-center rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
                              style={{ background: "rgba(251,191,36,0.9)", color: "#0f172a" }}
                              title="Disable Line"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={processing}
                              onClick={() => doAction("notify", d.id)}
                              className="inline-flex items-center rounded px-2 py-1 text-xs border font-medium disabled:opacity-50"
                              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                              title="Notify Admin"
                            >
                              <Bell className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={processing}
                              onClick={() => doAction("resolve", d.id)}
                              className="inline-flex items-center rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
                              style={{ background: "var(--btn-positive)", color: "#fff" }}
                              title="Mark Resolved"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDetailId(detailId === d.id ? null : d.id)}
                              className="inline-flex items-center rounded px-2 py-1 text-xs border transition-colors hover:opacity-80"
                              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
            <h3 className="text-sm font-semibold">Detection Details</h3>
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
              <span style={{ color: "var(--muted)" }}>IP Address</span>
              <span className="font-mono">{detail.ipAddress}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Line Username</span>
              <span>{detail.lineUsername}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Concurrent Lines</span>
              <span className="font-semibold">{detail.concurrentLines}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Detected At</span>
              <span>{detail.detectedAt}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Auto Action</span>
              <span className="inline-flex items-center gap-1 text-xs">
                {ACTION_ICONS[detail.autoAction]}
                {detail.autoAction}
              </span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Action Taken</span>
              <span>{detail.actionTaken ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Status</span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: STATUS_STYLES[detail.status].bg, color: STATUS_STYLES[detail.status].color }}
              >
                {STATUS_STYLES[detail.status].icon}
                {detail.status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
