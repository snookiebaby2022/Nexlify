"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, Play, CheckCircle, XCircle, Clock } from "lucide-react";

type FailoverTest = {
  id: string;
  name: string;
  streamId: string;
  status: string;
  result?: string;
  startedAt: number;
  completedAt?: number;
};

export default function FailoverTestingPage() {
  const [tests, setTests] = useState<FailoverTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", streamId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/failover-testing");
      const data = await res.json();
      setTests(data.tests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name || !form.streamId) return;
    setLoading(true);
    try {
      await fetch("/api/admin/failover-testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      });
      setForm({ name: "", streamId: "" });
      setShowCreate(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const update = async (testId: string, status: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/failover-testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", testId, status, result: status === "completed" ? "Test passed" : "Test failed" }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (testId: string) => {
    if (!confirm("Delete this test?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/failover-testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", testId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  const statusIcon = (s: string) => {
    if (s === "completed") return <CheckCircle size={14} className="text-green-400" />;
    if (s === "failed") return <XCircle size={14} className="text-red-400" />;
    if (s === "running") return <RefreshCw size={14} className="text-yellow-400 animate-spin" />;
    return <Clock size={14} className="text-gray-400" />;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Failover Testing</h1>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            <Plus size={12} /> New Test
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Create Failover Test</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Test name" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input value={form.streamId} onChange={e => setForm(p => ({ ...p, streamId: e.target.value }))} placeholder="Stream ID" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>Create</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Stream</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Result</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.map(t => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{t.streamId}</td>
                <td className="px-4 py-3 flex items-center gap-2">{statusIcon(t.status)} <span className="capitalize text-xs">{t.status}</span></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>{t.result || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {t.status === "pending" && (
                      <button onClick={() => update(t.id, "completed")} className="p-1.5 rounded hover:bg-white/5 text-green-400" title="Run"><Play size={14} /></button>
                    )}
                    <button onClick={() => remove(t.id)} className="p-1.5 rounded hover:bg-white/5 text-red-400" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!tests.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No failover tests</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
