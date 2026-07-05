"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, Wifi } from "lucide-react";

type QualityAlert = {
  id: string;
  streamId: string;
  issue: string;
  severity: string;
  timestamp: number;
};

export default function QualityMonitoringPage() {
  const [alerts, setAlerts] = useState<QualityAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/quality-monitoring");
      const data = await res.json();
      setAlerts(data.alerts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stream Quality Monitoring</h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-4 py-3 font-medium text-sm flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <AlertTriangle size={16} /> Quality Alerts
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium">Stream</th>
              <th className="px-4 py-3 text-left font-medium">Issue</th>
              <th className="px-4 py-3 text-left font-medium">Severity</th>
              <th className="px-4 py-3 text-left font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map(a => (
              <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-mono text-xs">{a.streamId}</td>
                <td className="px-4 py-3">{a.issue}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${a.severity === "critical" ? "bg-red-900/30 text-red-400" : "bg-yellow-900/30 text-yellow-400"}`}>{a.severity}</span></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>{new Date(a.timestamp).toLocaleString()}</td>
              </tr>
            ))}
            {!alerts.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No quality alerts</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
