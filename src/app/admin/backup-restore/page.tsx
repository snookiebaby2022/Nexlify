"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Download, Trash2, Plus, Database, Upload } from "lucide-react";

type Backup = {
  id: string;
  name: string;
  createdAt: number;
  size: number;
  status: string;
  includes: string[];
};

type BackupJob = {
  id: string;
  status: "running" | "done" | "failed";
  message: string | null;
  progress: { phase: string; current: number; total: number } | null;
  path?: string;
  size?: number;
  error?: string;
};

type DatabaseTable = "lines" | "users" | "categories" | "streams" | "packages" | "coupons" | "epg_sources";

function progressPercent(job: BackupJob | null): number {
  if (!job?.progress) return job?.status === "done" ? 100 : 0;
  const { phase, current, total } = job.progress;
  if (phase === "done") return 100;
  if (phase === "streams") {
    return Math.min(85, Math.round((current / Math.max(1, total)) * 70) + 10);
  }
  if (phase === "lines") {
    return Math.min(92, Math.round((current / Math.max(1, total)) * 10) + 80);
  }
  if (total > 0) return Math.min(99, Math.round((current / total) * 100));
  return 5;
}

export default function BackupRestorePage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [job, setJob] = useState<BackupJob | null>(null);
  const [creating, setCreating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showDatabaseRestore, setShowDatabaseRestore] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup");
      const data = await res.json();
      setBackups(data.backups ?? []);
      if (data.job) setJob(data.job);
    } finally {
      setLoading(false);
    }
  }, []);

  const pollJob = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup?job=1");
      const data = await res.json();
      const j = data.job as BackupJob | null;
      setJob(j);
      if (j?.status === "done" || j?.status === "failed") {
        stopPoll();
        setCreating(false);
        if (j.status === "done") {
          setShowCreate(false);
          setNewName("");
          await load();
        }
      }
    } catch {
      /* keep polling */
    }
  }, [load, stopPoll]);

  const startPolling = useCallback(() => {
    stopPoll();
    void pollJob();
    pollRef.current = setInterval(() => {
      void pollJob();
    }, 1000);
  }, [pollJob, stopPoll]);

  useEffect(() => {
    void load();
    return () => stopPoll();
  }, [load, stopPoll]);

  useEffect(() => {
    if (job?.status === "running") startPolling();
  }, [job?.status, startPolling]);

  const create = async () => {
    setCreating(true);
    setJob({
      id: "pending",
      status: "running",
      message: "Starting backup…",
      progress: { phase: "initializing", current: 0, total: 100 },
    });
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setCreating(false);
        setJob(
          data.job ?? {
            id: "failed",
            status: "failed",
            message: data.error || `HTTP ${res.status}`,
            progress: null,
            error: data.error || `HTTP ${res.status}`,
          }
        );
        return;
      }
      setJob(data.job);
      startPolling();
    } catch (err) {
      setCreating(false);
      setJob({
        id: "failed",
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
        progress: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this backup? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/backup?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        await load();
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

  const handleFileUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const content = await uploadFile.text();
      let snapshot: unknown;
      try {
        snapshot = JSON.parse(content);
      } catch {
        setUploadResult("Error: File is not valid JSON. For .sql.gz database backups use Settings → Backup restore tooling.");
        setUploading(false);
        return;
      }
      const res = await fetch("/api/admin/backup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
      });
      const data = await res.json();
      if (data.ok) {
        const r = data.restored ?? {};
        const parts = [
          r.settings ? `${r.settings} settings` : "",
          r.categories ? `${r.categories} categories` : "",
          r.bouquets ? `${r.bouquets} bouquets` : "",
          r.streams ? `${r.streams} streams` : "",
          r.lines ? `${r.lines} lines` : "",
          r.users ? `${r.users} users` : "",
          r.packages ? `${r.packages} packages` : "",
          r.coupons ? `${r.coupons} coupons` : "",
          r.epgSources ? `${r.epgSources} EPG sources` : "",
        ].filter(Boolean);
        setUploadResult(`Restored: ${parts.join(", ") || "done"}`);
        await load();
      } else {
        setUploadResult("Error: " + (data.error || data.message || "Unknown error"));
      }
    } catch (err) {
      setUploadResult("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  };

  const performDatabaseRestore = async () => {
    if (!restoreInfo.backupId) return;
    setLoading(true);
    try {
      const fileRes = await fetch(`/api/admin/backup?file=${encodeURIComponent(restoreInfo.backupId)}`);
      const fileData = await fileRes.json();
      if (!fileRes.ok) {
        alert(fileData.error || "Failed to read backup file");
        setLoading(false);
        return;
      }
      if (!fileData.snapshot) {
        alert(
          fileData.message ||
            "This backup cannot be preview-restored in-browser (encrypted or too large). Download it and use Upload Backup."
        );
        setLoading(false);
        return;
      }

      const restoreRes = await fetch("/api/admin/backup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: fileData.snapshot }),
      });
      const result = await restoreRes.json();
      setLoading(false);
      cancelRestore();
      if (result.ok) {
        await load();
      } else {
        alert("Restore failed: " + (result.error || result.message || "Unknown error"));
      }
    } catch (err) {
      setLoading(false);
      alert("Database restore failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const totalSelected = Object.values(restoreInfo.tables).reduce(
    (sum, v) => sum + (v.selected ? 1 : 0),
    0
  );
  const pct = progressPercent(job);
  const jobActive = creating || job?.status === "running";

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Backup &amp; Restore</h1>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading || jobActive}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border"
            style={{ borderColor: "var(--border)" }}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            disabled={jobActive}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Plus size={12} /> New Backup
          </button>
          <button
            onClick={() => {
              setShowFileUpload(!showFileUpload);
              setUploadResult(null);
              setUploadFile(null);
            }}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border"
            style={{ borderColor: "var(--border)" }}
          >
            <Upload size={12} /> Upload Backup
          </button>
        </div>
      </div>

      {(jobActive || job?.status === "failed" || (job?.status === "done" && job.message)) && (
        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {job?.status === "failed"
                ? "Backup failed"
                : job?.status === "done"
                  ? "Backup complete"
                  : "Creating backup"}
            </h3>
            <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
              {job?.status === "running" || creating ? `${pct}%` : job?.status === "done" ? "100%" : ""}
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--border)" }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${job?.status === "failed" ? 100 : pct}%`,
                background: job?.status === "failed" ? "#ef4444" : "var(--accent)",
              }}
            />
          </div>
          <p className="text-xs" style={{ color: job?.status === "failed" ? "#f87171" : "var(--muted)" }}>
            {job?.message || job?.error || "Working…"}
          </p>
        </div>
      )}

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Create Backup</h3>
          <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
            Large catalogs (hundreds of thousands of streams) run in the background so the browser does not time out.
          </p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Backup name (optional, stored in filename stamp)"
              className="flex-1 px-3 py-1.5 rounded border text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
              disabled={jobActive}
            />
            <button
              onClick={create}
              disabled={jobActive}
              className="px-3 py-1.5 rounded text-sm"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {jobActive ? "Running…" : "Create"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              disabled={jobActive}
              className="px-3 py-1.5 rounded border text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showFileUpload && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Upload Backup File</h3>
          <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
            Upload a JSON panel backup to restore. Very large files may need to be restored on the server.
          </p>
          <div className="flex gap-2 items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="flex-1 text-sm"
            />
            <button
              onClick={handleFileUpload}
              disabled={!uploadFile || uploading}
              className="px-3 py-1.5 rounded text-sm"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {uploading ? "Restoring..." : "Restore"}
            </button>
            <button
              onClick={() => {
                setShowFileUpload(false);
                setUploadFile(null);
                setUploadResult(null);
              }}
              className="px-3 py-1.5 rounded border text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              Cancel
            </button>
          </div>
          {uploadResult && (
            <p className={`text-xs mt-2 ${uploadResult.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
              {uploadResult}
            </p>
          )}
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
            {backups.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3">{b.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                  {new Date(b.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                  {b.size < 1024 * 1024
                    ? `${(b.size / 1024).toFixed(1)} KB`
                    : `${(b.size / (1024 * 1024)).toFixed(1)} MB`}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <a
                      href={`/api/admin/backup?file=${encodeURIComponent(b.id)}&download=1`}
                      className="p-1.5 rounded hover:bg-white/5 inline-flex"
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      onClick={() => {
                        setRestoreInfo({
                          backupId: b.id,
                          tables: {
                            lines: { selected: true, count: 0 },
                            users: { selected: true, count: 0 },
                            categories: { selected: true, count: 0 },
                            streams: { selected: true, count: 0 },
                            packages: { selected: true, count: 0 },
                            coupons: { selected: true, count: 0 },
                            epg_sources: { selected: true, count: 0 },
                          },
                          confirmed: false,
                        });
                        setShowDatabaseRestore(true);
                      }}
                      className="p-1.5 rounded hover:bg-white/5"
                      title="Restore Database"
                    >
                      <Database size={14} />
                    </button>
                    <button
                      onClick={() => remove(b.id)}
                      className="p-1.5 rounded hover:bg-white/5 text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!backups.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                  No backups yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showDatabaseRestore && restoreInfo.backupId && (
        <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-4">Database Restore Preview</h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            This will restore from backup &quot;
            <strong>{backups.find((b) => b.id === restoreInfo.backupId)?.name ?? "unknown"}</strong>
            &quot;. Full snapshot restore applies all tables present in the file (selection is informational).
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
                        className="rounded border"
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
              onClick={performDatabaseRestore}
              disabled={totalSelected === 0 || loading}
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
            >
              {loading ? "Restoring…" : totalSelected > 0 ? `Restore ${totalSelected} table(s)` : "Restore"}
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
