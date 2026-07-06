"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, RefreshCwIcon, Check, X } from "lucide-react";

type EpgSource = {
  id: string;
  name: string;
  url: string;
  type: "xmltv" | "xtream" | "custom";
  isActive: boolean;
  priority: number;
  lastSyncAt: string | null;
  lastError: string | null;
  channelCount: number;
};

export default function EpgSourcesPage() {
  const [sources, setSources] = useState<EpgSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newSource, setNewSource] = useState({ name: "", url: "", type: "xmltv" as const, priority: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/epg-sources?action=sources");
      if (res.ok) {
        const data = await res.json();
        setSources(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load EPG sources:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addSource = async () => {
    if (!newSource.name || !newSource.url) return;
    await fetch("/api/admin/epg-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", source: newSource }),
    });
    setNewSource({ name: "", url: "", type: "xmltv", priority: 1 });
    setShowAdd(false);
    load();
  };

  const removeSource = async (id: string) => {
    await fetch("/api/admin/epg-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", id }),
    });
    load();
  };

  const syncSource = async (id: string) => {
    await fetch("/api/admin/epg-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", id }),
    });
    load();
  };

  const syncAll = async () => {
    await fetch("/api/admin/epg-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-all" }),
    });
    load();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Custom EPG Sources</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Manage XMLTV and custom EPG sources for your channels
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={syncAll} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border)" }}>
            <RefreshCwIcon size={14} /> Sync All
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
            <Plus size={14} /> Add Source
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold">Add EPG Source</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Source name" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} className="px-3 py-2 rounded-lg border bg-transparent text-sm" style={{ borderColor: "var(--border)" }} />
            <input placeholder="URL (XMLTV or API)" value={newSource.url} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} className="px-3 py-2 rounded-lg border bg-transparent text-sm" style={{ borderColor: "var(--border)" }} />
          </div>
          <div className="flex gap-3">
            <select value={newSource.type} onChange={(e) => setNewSource({ ...newSource, type: e.target.value as "xmltv" | "xtream" | "custom" })} className="px-3 py-2 rounded-lg border bg-transparent text-sm" style={{ borderColor: "var(--border)" }}>
              <option value="xmltv">XMLTV</option>
              <option value="xtream">Xtream</option>
              <option value="custom">Custom</option>
            </select>
            <input type="number" placeholder="Priority" value={newSource.priority} onChange={(e) => setNewSource({ ...newSource, priority: Number(e.target.value) })} className="w-24 px-3 py-2 rounded-lg border bg-transparent text-sm" style={{ borderColor: "var(--border)" }} min={1} max={10} />
            <button onClick={addSource} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--accent)" }}>Add</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sources.map((source) => (
          <div key={source.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{source.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: source.isActive ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)", color: source.isActive ? "#22c55e" : "var(--muted)" }}>
                    {source.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(0,192,239,0.15)", color: "var(--accent)" }}>
                    {source.type.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{source.url}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums">{source.channelCount} channels</span>
                <button onClick={() => syncSource(source.id)} className="p-1.5 rounded hover:opacity-80" title="Sync">
                  <RefreshCw size={14} />
                </button>
                <button onClick={() => removeSource(source.id)} className="p-1.5 rounded hover:text-red-400" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {source.lastSyncAt && <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>Last sync: {new Date(source.lastSyncAt).toLocaleString()}</p>}
            {source.lastError && <p className="text-xs mt-1 text-red-400">Error: {source.lastError}</p>}
          </div>
        ))}
        {sources.length === 0 && <p className="text-center py-8 text-sm" style={{ color: "var(--muted)" }}>No EPG sources configured</p>}
      </div>
    </div>
  );
}
