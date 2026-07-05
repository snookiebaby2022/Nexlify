"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Download, Upload, Trash2, Plus } from "lucide-react";

type Backup = {
  id: string;
  name: string;
  createdAt: number;
  size: number;
  status: string;
  includes: string[];
};

export default function BackupRestorePage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup-restore");
      const data = await res.json();
      setBackups(data.backups ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName) return;
    setLoading(true);
    try {
      await fetch("/api/admin/backup-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: newName }),
      });
      setNewName("");
      setShowCreate(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const restore = async (backupId: string) => {
    if (!confirm("Restore this backup? Current data will be overwritten.")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/backup-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", backupId }),
      });
    } finally {
      setLoading(false);
    }
  };

  const remove = async (backupId: string) => {
    if (!confirm("Delete this backup?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/backup-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", backupId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Backup & Restore</h1>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            <Plus size={12} /> New Backup
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Create Backup</h3>
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Backup name" className="flex-1 px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
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
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3">{b.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{new Date(b.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${b.status === "completed" ? "bg-green-900/30 text-green-400" : b.status === "in_progress" ? "bg-yellow-900/30 text-yellow-400" : "bg-red-900/30 text-red-400"}`}>
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => restore(b.id)} className="p-1.5 rounded hover:bg-white/5" title="Restore"><Upload size={14} /></button>
                    <button onClick={() => remove(b.id)} className="p-1.5 rounded hover:bg-white/5 text-red-400" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!backups.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No backups yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
