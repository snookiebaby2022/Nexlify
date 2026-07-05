"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, RefreshCcw, Tv } from "lucide-react";

type EpgSource = {
  id: string;
  name: string;
  url: string;
  format: string;
  isActive: boolean;
  lastSync: number;
  quality: number;
};

export default function AdvancedEpgPage() {
  const [sources, setSources] = useState<EpgSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", format: "xmltv" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/advanced-epg");
      const data = await res.json();
      setSources(data.sources ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name || !form.url) return;
    setLoading(true);
    try {
      await fetch("/api/admin/advanced-epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      });
      setForm({ name: "", url: "", format: "xmltv" });
      setShowCreate(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const sync = async (sourceId: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/advanced-epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", sourceId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (sourceId: string) => {
    if (!confirm("Delete this EPG source?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/advanced-epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", sourceId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Advanced EPG Sources</h1>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            <Plus size={12} /> Add Source
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Add EPG Source</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Source name" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="XMLTV URL" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <select value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <option value="xmltv">XMLTV</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>Add</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Format</th>
              <th className="px-4 py-3 text-left font-medium">Last Sync</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 uppercase text-xs">{s.format}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{s.lastSync ? new Date(s.lastSync).toLocaleString() : "Never"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => sync(s.id)} className="p-1.5 rounded hover:bg-white/5" title="Sync"><RefreshCcw size={14} /></button>
                    <button onClick={() => remove(s.id)} className="p-1.5 rounded hover:bg-white/5 text-red-400" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!sources.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No EPG sources configured</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
