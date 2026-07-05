"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Flag, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

type ModerationFlag = {
  id: string;
  streamId: string;
  streamName: string;
  reason: string;
  severity: string;
  status: string;
  flaggedAt: number;
};

export default function ContentModerationPage() {
  const [flags, setFlags] = useState<ModerationFlag[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content-moderation");
      const data = await res.json();
      setFlags(data.flags ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (flagId: string, status: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/content-moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", flagId, status }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  const severityColor = (s: string) => {
    if (s === "high") return "text-red-400 bg-red-900/30";
    if (s === "medium") return "text-yellow-400 bg-yellow-900/30";
    return "text-blue-400 bg-blue-900/30";
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Content Moderation</h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium">Stream</th>
              <th className="px-4 py-3 text-left font-medium">Reason</th>
              <th className="px-4 py-3 text-left font-medium">Severity</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {flags.map(f => (
              <tr key={f.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-medium">{f.streamName || f.streamId}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{f.reason}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${severityColor(f.severity)}`}>{f.severity}</span></td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${f.status === "approved" ? "bg-green-900/30 text-green-400" : f.status === "rejected" ? "bg-red-900/30 text-red-400" : "bg-yellow-900/30 text-yellow-400"}`}>{f.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {f.status === "pending" && (
                      <>
                        <button onClick={() => review(f.id, "approved")} className="p-1.5 rounded hover:bg-white/5 text-green-400" title="Approve"><CheckCircle size={14} /></button>
                        <button onClick={() => review(f.id, "rejected")} className="p-1.5 rounded hover:bg-white/5 text-red-400" title="Reject"><XCircle size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!flags.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No flagged content</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
