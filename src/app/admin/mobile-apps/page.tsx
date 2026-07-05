"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, Smartphone } from "lucide-react";

type MobileApp = {
  id: string;
  name: string;
  packageName: string;
  version: string;
  status: string;
  createdAt: number;
};

export default function MobileAppsPage() {
  const [apps, setApps] = useState<MobileApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPkg, setNewPkg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mobile-app");
      const data = await res.json();
      setApps(data.apps ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName || !newPkg) return;
    setLoading(true);
    try {
      await fetch("/api/admin/mobile-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: newName, packageName: newPkg }),
      });
      setNewName("");
      setNewPkg("");
      setShowCreate(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (appId: string) => {
    if (!confirm("Delete this app?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/mobile-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", appId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">White-label Mobile Apps</h1>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            <Plus size={12} /> New App
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Create Mobile App</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="App name" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input value={newPkg} onChange={e => setNewPkg(e.target.value)} placeholder="Package name (com.example.app)" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>Build</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map(app => (
          <div key={app.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <Smartphone size={24} style={{ color: "var(--accent)" }} />
              <div>
                <div className="font-medium">{app.name}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{app.packageName}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--muted)" }}>v{app.version}</span>
              <div className="flex gap-1">
                <span className={`text-xs px-2 py-0.5 rounded ${app.status === "completed" ? "bg-green-900/30 text-green-400" : app.status === "building" ? "bg-yellow-900/30 text-yellow-400" : "bg-red-900/30 text-red-400"}`}>
                  {app.status}
                </span>
                <button onClick={() => remove(app.id)} className="p-1 rounded hover:bg-white/5 text-red-400" title="Delete"><Trash2 size={12} /></button>
              </div>
            </div>
          </div>
        ))}
        {!apps.length && (
          <div className="col-span-full text-center py-12" style={{ color: "var(--muted)" }}>No mobile apps configured</div>
        )}
      </div>
    </div>
  );
}
