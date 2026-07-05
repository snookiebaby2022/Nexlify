"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Shield, AlertTriangle, CheckCircle, Plus, Trash2 } from "lucide-react";

type SecurityAlert = {
  id: string;
  type: string;
  severity: string;
  sourceIp: string;
  description: string;
  timestamp: number;
  resolved: boolean;
};

type IPEntry = {
  ip: string;
  description: string;
  addedAt: number;
};

export default function SecurityAlertsPage() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [whitelist, setWhitelist] = useState<IPEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddIp, setShowAddIp] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newIpDesc, setNewIpDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/security-features");
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setWhitelist(data.whitelist ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (alertId: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/security-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", alertId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  const addIp = async () => {
    if (!newIp) return;
    setLoading(true);
    try {
      await fetch("/api/admin/security-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "whitelist_add", ip: newIp, description: newIpDesc }),
      });
      setNewIp("");
      setNewIpDesc("");
      setShowAddIp(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const removeIp = async (ip: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/security-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "whitelist_remove", ip }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  const severityColor = (s: string) => {
    if (s === "critical") return "text-red-400 bg-red-900/30";
    if (s === "high") return "text-orange-400 bg-orange-900/30";
    if (s === "medium") return "text-yellow-400 bg-yellow-900/30";
    return "text-blue-400 bg-blue-900/30";
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Security Features</h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold">Security Alerts</h2>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">Severity</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 text-xs">{a.type}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.sourceIp}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${severityColor(a.severity)}`}>{a.severity}</span></td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${a.resolved ? "bg-green-900/30 text-green-400" : "bg-yellow-900/30 text-yellow-400"}`}>{a.resolved ? "resolved" : "open"}</span></td>
                    <td className="px-4 py-3 text-right">
                      {!a.resolved && <button onClick={() => resolve(a.id)} className="p-1.5 rounded hover:bg-white/5 text-green-400" title="Resolve"><CheckCircle size={14} /></button>}
                    </td>
                  </tr>
                ))}
                {!alerts.length && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No security alerts</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">IP Whitelist</h2>
            <button onClick={() => setShowAddIp(true)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
              <Plus size={12} />
            </button>
          </div>

          {showAddIp && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="IP Address" className="w-full px-3 py-1.5 rounded border text-sm mb-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
              <input value={newIpDesc} onChange={e => setNewIpDesc(e.target.value)} placeholder="Description" className="w-full px-3 py-1.5 rounded border text-sm mb-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
              <div className="flex gap-2">
                <button onClick={addIp} className="px-3 py-1 rounded text-xs" style={{ background: "var(--accent)", color: "#fff" }}>Add</button>
                <button onClick={() => setShowAddIp(false)} className="px-3 py-1 rounded border text-xs" style={{ borderColor: "var(--border)" }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {whitelist.map(w => (
              <div key={w.ip} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="font-mono text-sm">{w.ip}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{w.description}</div>
                </div>
                <button onClick={() => removeIp(w.ip)} className="p-1 rounded hover:bg-white/5 text-red-400"><Trash2 size={12} /></button>
              </div>
            ))}
            {!whitelist.length && (
              <div className="px-3 py-4 text-center text-sm" style={{ color: "var(--muted)" }}>No whitelisted IPs</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
