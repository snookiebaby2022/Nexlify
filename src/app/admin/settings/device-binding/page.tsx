"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Smartphone,
  Monitor,
  Tv,
  CheckCircle2,
  XCircle,
  Eye,
  Download,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Filter,
  ChevronDown,
  MoreHorizontal,
  CheckSquare,
  Square,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";

interface DeviceBinding {
  id: string;
  lineUsername: string;
  deviceId: string;
  deviceType: "MOBILE" | "WEB" | "TV" | "DESKTOP" | "UNKNOWN";
  deviceName: string;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  boundDate: string;
  lastSeen: string;
}

interface DeviceStats {
  total: number;
  pending: number;
  active: number;
  revoked: number;
}

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  MOBILE: <Smartphone className="w-4 h-4" />,
  WEB: <Monitor className="w-4 h-4" />,
  TV: <Tv className="w-4 h-4" />,
  DESKTOP: <Monitor className="w-4 h-4" />,
  UNKNOWN: <Smartphone className="w-4 h-4" />,
};

const STATUS_STYLES: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  PENDING: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24", icon: <Clock className="w-3.5 h-3.5" /> },
  ACTIVE: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  REVOKED: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
};

export default function DeviceBindingPage() {
  const [bindings, setBindings] = useState<DeviceBinding[]>([]);
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/admin/device-bindings").then((r) => r.json()),
      fetch("/api/admin/device-bindings/stats").then((r) => r.json()),
    ])
      .then(([data, s]) => {
        setBindings(data.bindings ?? []);
        setStats(s ?? null);
      })
      .catch(() => setError("Failed to load device bindings."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = bindings.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      b.lineUsername.toLowerCase().includes(q) ||
      b.deviceId.toLowerCase().includes(q) ||
      b.deviceName.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "ALL" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((b) => b.id)));
    }
  };

  async function doAction(action: "approve" | "revoke", ids: string[]) {
    if (!ids.length) return;
    setProcessing(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/device-bindings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const j = await res.json();
      if (res.ok) {
        setActionMsg(`${action === "approve" ? "Approved" : "Revoked"} ${ids.length} binding(s).`);
        load();
        setSelectedIds(new Set());
      } else {
        setActionMsg(j.error || "Action failed.");
      }
    } catch {
      setActionMsg("Network error.");
    } finally {
      setProcessing(false);
    }
  }

  function exportCSV() {
    const rows = [
      ["Line Username", "Device ID", "Device Type", "Device Name", "Status", "Bound Date", "Last Seen"],
      ...filtered.map((b) => [
        b.lineUsername,
        b.deviceId,
        b.deviceType,
        b.deviceName,
        b.status,
        b.boundDate,
        b.lastSeen,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `device-bindings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const detail = detailId ? bindings.find((b) => b.id === detailId) : null;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Device Bindings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Manage ActiveCode anti-sharing device bindings. Approve or revoke device access per line.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, color: "var(--accent)" },
            { label: "Pending", value: stats.pending, color: "#fbbf24" },
            { label: "Active", value: stats.active, color: "#22c55e" },
            { label: "Revoked", value: stats.revoked, color: "#ef4444" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                {s.label}
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: s.color }}>
                {s.value}
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
              placeholder="Search by line username or device ID..."
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
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted)" }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--muted)" }}
          >
            <RotateCcw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--muted)" }}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </button>
        </div>
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

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {selectedIds.size} selected
          </span>
          <button
            disabled={processing}
            onClick={() => doAction("revoke", Array.from(selectedIds))}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--btn-negative)", color: "#fff" }}
          >
            <Trash2 className="w-4 h-4" />
            Revoke Selected
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading device bindings...</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-card)" }}>
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <button onClick={toggleAll} className="cursor-pointer">
                      {selectedIds.size === filtered.length && filtered.length > 0 ? (
                        <CheckSquare className="w-4 h-4" style={{ color: "var(--accent)" }} />
                      ) : (
                        <Square className="w-4 h-4" style={{ color: "var(--muted)" }} />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Line</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Device</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Type</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Status</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Bound</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Last Seen</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                      No device bindings found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((b) => {
                    const ss = STATUS_STYLES[b.status];
                    return (
                      <tr key={b.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleSelect(b.id)} className="cursor-pointer">
                            {selectedIds.has(b.id) ? (
                              <CheckSquare className="w-4 h-4" style={{ color: "var(--accent)" }} />
                            ) : (
                              <Square className="w-4 h-4" style={{ color: "var(--muted)" }} />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium">{b.lineUsername}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span style={{ color: "var(--muted)" }}>{DEVICE_ICONS[b.deviceType]}</span>
                            <span className="max-w-[10rem] truncate">{b.deviceName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            {b.deviceType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{ background: ss.bg, color: ss.color }}
                          >
                            {ss.icon}
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{b.boundDate}</td>
                        <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{b.lastSeen}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {b.status === "PENDING" && (
                              <button
                                disabled={processing}
                                onClick={() => doAction("approve", [b.id])}
                                className="inline-flex items-center rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
                                style={{ background: "var(--btn-positive)", color: "#fff" }}
                                title="Approve"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {b.status !== "REVOKED" && (
                              <button
                                disabled={processing}
                                onClick={() => doAction("revoke", [b.id])}
                                className="inline-flex items-center rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
                                style={{ background: "var(--btn-negative)", color: "#fff" }}
                                title="Revoke"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setDetailId(detailId === b.id ? null : b.id)}
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
            <h3 className="text-sm font-semibold">Device Details</h3>
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
              <span style={{ color: "var(--muted)" }}>Device ID</span>
              <span className="font-mono">{detail.deviceId}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Line Username</span>
              <span>{detail.lineUsername}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Device Name</span>
              <span>{detail.deviceName}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Device Type</span>
              <span>{detail.deviceType}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Status</span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{
                  background: STATUS_STYLES[detail.status].bg,
                  color: STATUS_STYLES[detail.status].color,
                }}
              >
                {STATUS_STYLES[detail.status].icon}
                {detail.status}
              </span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Bound Date</span>
              <span>{detail.boundDate}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Last Seen</span>
              <span>{detail.lastSeen}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
