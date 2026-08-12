"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Download, Trash2, Plus, Database, CheckCircle } from "lucide-react";

type Backup = {
  id: string;
  name: string;
  createdAt: number;
  size: number;
  status: string;
  includes: string[];
};

type DatabaseTable = "lines" | "users" | "categories" | "streams" | "packages" | "coupons" | "epg_sources";

export default function BackupRestorePage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [showDatabaseRestore, setShowDatabaseRestore] = useState(false);
  const [restoreInfo, setRestoreInfo] = useState<{
    backupId: string | null;
    tables: Record<DatabaseTable, { selected: boolean; count: number }>;
    confirmed: boolean;
  }>({
    backupId: null,
    tables: {
      lines: { selected: false, count: 0 },
      users: { selected: false, count: 0 },
      categories: { selected: false, count: 0 },
      streams: { selected: false, count: 0 },
      packages: { selected: false, count: 0 },
      coupons: { selected: false, count: 0 },
      epg_sources: { selected: false, count: 0 },
    },
    confirmed: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup");
      const data = await res.json();
      setBackups(data.backups ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setShowCreate(false);
        setNewName("");
        load();
      } else {
        alert("Backup failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Backup failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this backup? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/backup?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        load();
      } else {
        alert("Delete failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Delete failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const loadTableToggle = (table: DatabaseTable, selected: boolean) => {
    setRestoreInfo((prev) => ({
      ...prev,
      tables: { ...prev.tables, [table]: { ...prev.tables[table], selected } },
    }));
  };

  const confirmRestore = () => {
    setRestoreInfo((prev) => ({ ...prev, confirmed: true }));
  };

  const cancelRestore = () => {
    setShowDatabaseRestore(false);
    setRestoreInfo({
      backupId: null,
      tables: {
        lines: { selected: false, count: 0 },
        users: { selected: false, count: 0 },
        categories: { selected: false, count: 0 },
        streams: { selected: false, count: 0 },
        packages: { selected: false, count: 0 },
        coupons: { selected: false, count: 0 },
        epg_sources: { selected: false, count: 0 },
      },
      confirmed: false,
    });
  };

  const performDatabaseRestore = async () => {
    if (!restoreInfo.backupId || !restoreInfo.confirmed) return;
    setLoading(true);
    try {
      await fetch("/api/admin/backup-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore_database",
          backupId: restoreInfo.backupId,
          tables: Object.fromEntries(
            Object.entries(restoreInfo.tables)
              .filter(([, v]) => v.selected)
              .map(([k]) => [k, true])
          ),
        }),
      });
      setLoading(false);
      setShowDatabaseRestore(false);
      cancelRestore();
      load();
    } catch (err) {
      setLoading(false);
      alert("Database restore failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const totalSelected = Object.values(restoreInfo.tables).reduce(
    (sum, v) => sum + (v.selected ? 1 : 0),
    0
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Backup &amp; Restore</h1>
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
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Backup name (optional)" className="flex-1 px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
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
              <th className="px-4 py-3 text-left font-medium">Size</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3">{b.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{new Date(b.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                  {b.size < 1024 * 1024 ? `${(b.size / 1024).toFixed(1)} KB` : `${(b.size / (1024 * 1024)).toFixed(1)} MB`}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => {
                      setRestoreInfo({
                        backupId: b.id,
                        tables: {
                          lines: { selected: false, count: 0 },
                          users: { selected: false, count: 0 },
                          categories: { selected: false, count: 0 },
                          streams: { selected: false, count: 0 },
                          packages: { selected: false, count: 0 },
                          coupons: { selected: false, count: 0 },
                          epg_sources: { selected: false, count: 0 },
                        },
                        confirmed: false,
                      });
                      setShowDatabaseRestore(true);
                    }} className="p-1.5 rounded hover:bg-white/5" title="Restore Database"><Database size={14} /></button>
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

      {showDatabaseRestore && restoreInfo.backupId && (
        <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-4">Database Restore Preview</h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            This will restore database tables from backup &quot;<strong>{backups.find((b) => b.id === restoreInfo.backupId)?.name ?? "unknown"}</strong>&quot;. Select tables to restore:
          </p>
          <div className="space-y-3">
            {Object.entries(restoreInfo.tables).map(([table, info]) => {
              const labelMap: Record<DatabaseTable, string> = {
                lines: "Lines",
                users: "Users",
                categories: "Categories",
                streams: "Streams",
                packages: "Packages",
                coupons: "Coupons",
                epg_sources: "EPG Sources",
              };
              return (
                <div key={table} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--muted)]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={info.selected}
                        onChange={(e) => loadTableToggle(table as DatabaseTable, e.target.checked)}
                        className="rounded border accent-color-violet-500"
                      />
                      {labelMap[table as DatabaseTable]}
                    </label>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-6 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={confirmRestore}
              disabled={totalSelected === 0}
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
            >
              {totalSelected > 0 ? `Restore ${totalSelected} table(s)` : "Restore"}
            </button>
            <button
              onClick={cancelRestore}
              className="rounded-lg bg-gray-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-500 disabled:opacity-50 ml-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
