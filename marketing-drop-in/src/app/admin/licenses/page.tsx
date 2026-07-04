"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Monitor, Globe, Users, Shield, Clock, ExternalLink, CheckCircle, XCircle, AlertCircle } from "lucide-react";

type Installation = {
  id: string;
  key: string;
  email: string;
  name: string | null;
  plan: string;
  machineId: string;
  panelUrl: string | null;
  status: string;
  maxLines: number;
  activatedAt: string | null;
  lastSyncAt: string | null;
  hoursSinceSync: number | null;
  isOnline: boolean;
  expiresAt: string | null;
};

type Data = {
  summary: {
    total: number;
    active: number;
    expired: number;
    revoked: number;
    suspended: number;
    unused: number;
    online: number;
  };
  installations: Installation[];
  recentActivations: {
    email: string;
    plan: string;
    activatedAt: string | null;
    panelUrl: string | null;
  }[];
};

export default function LicensesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/licenses");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = data?.installations.filter((i) => {
    if (filter === "online") return i.isOnline;
    if (filter === "offline") return !i.isOnline;
    return true;
  }) ?? [];

  if (!data) {
    return <div className="p-8 text-center" style={{ color: "var(--muted)" }}>{loading ? "Loading…" : "Failed to load"}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">License Monitor</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Track all panel installations and license activity
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm hover:opacity-80"
          style={{ borderColor: "var(--border)" }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total", value: data.summary.total, icon: Monitor, color: "var(--accent)" },
          { label: "Active", value: data.summary.active, icon: CheckCircle, color: "#22c55e" },
          { label: "Online", value: data.summary.online, icon: Globe, color: "#22c55e" },
          { label: "Offline", value: data.summary.active - data.summary.online, icon: XCircle, color: "#f97316" },
          { label: "Expired", value: data.summary.expired, icon: Clock, color: "#ef4444" },
          { label: "Suspended", value: data.summary.suspended, icon: AlertCircle, color: "#fbbf24" },
          { label: "Unused", value: data.summary.unused, icon: Shield, color: "var(--muted)" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border p-3 text-center"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <s.icon size={16} className="mx-auto mb-1" style={{ color: s.color }} />
            <div className="text-xl font-bold tabular-nums">{s.value}</div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "online", "offline"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === f ? "text-white" : "border"}`}
            style={filter === f ? { background: "var(--accent)" } : { borderColor: "var(--border)" }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({f === "all" ? data.installations.length : f === "online" ? data.summary.online : data.installations.length - data.summary.online})
          </button>
        ))}
      </div>

      {/* Installations Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.15)" }}>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>Customer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>Plan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>Panel URL</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>Machine ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>Last Seen</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>Lines</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>Expires</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inst) => (
              <tr key={inst.id} className="border-t hover:bg-white/[0.02]" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: inst.isOnline ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                      color: inst.isOnline ? "#22c55e" : "#ef4444",
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: inst.isOnline ? "#22c55e" : "#ef4444" }} />
                    {inst.isOnline ? "Online" : "Offline"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{inst.email}</div>
                  {inst.name && <div className="text-xs" style={{ color: "var(--muted)" }}>{inst.name}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(0,192,239,0.12)", color: "var(--accent)" }}>
                    {inst.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {inst.panelUrl ? (
                    <a
                      href={inst.panelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      {inst.panelUrl.replace(/^https?:\/\//, "").slice(0, 30)}
                      <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                    {inst.machineId?.slice(0, 8)}…
                  </span>
                </td>
                <td className="px-4 py-3">
                  {inst.lastSyncAt ? (
                    <div>
                      <div className="text-xs">{new Date(inst.lastSyncAt).toLocaleDateString()}</div>
                      <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                        {inst.hoursSinceSync !== null && inst.hoursSinceSync < 24
                          ? `${inst.hoursSinceSync}h ago`
                          : inst.hoursSinceSync !== null
                            ? `${Math.round(inst.hoursSinceSync / 24)}d ago`
                            : ""}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>Never</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums">{inst.maxLines}</td>
                <td className="px-4 py-3 text-xs">
                  {inst.expiresAt ? new Date(inst.expiresAt).toLocaleDateString() : "Never"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center" style={{ color: "var(--muted)" }}>
                  No installations found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Activations */}
      {data.recentActivations.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Recent Activations</h3>
          <div className="space-y-2">
            {data.recentActivations.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <div>
                  <span className="text-sm font-medium">{a.email}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: "rgba(0,192,239,0.12)", color: "var(--accent)" }}>
                    {a.plan}
                  </span>
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {a.activatedAt ? new Date(a.activatedAt).toLocaleString() : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
