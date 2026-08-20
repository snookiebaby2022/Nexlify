"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Edit2, RefreshCw, Trash2, CheckCircle2, XCircle, AlertTriangle, Zap } from "lucide-react";

type EpgSource = {
  id: string;
  name: string;
  url: string;
  sourceType: string;
  country?: string | null;
  isActive: boolean;
  lastSync?: string | null;
  lastSyncError?: string | null;
  syncEveryHours: number;
  channelCount?: number;
};

export default function ManageEpgPage() {
  const [sources, setSources] = useState<EpgSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState<{
    active: boolean;
    current: number;
    total: number;
    name: string;
    programs: number;
    errors: string[];
  } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", url: "", syncEveryHours: 24 });
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/epg")
      .then((r) => r.json())
      .then((d) => setSources(d.sources ?? d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function syncSource(id: string) {
    setSyncing((prev) => new Set(prev).add(id));
    setMsg("");
    try {
      const res = await fetch("/api/admin/epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: true, sourceId: id }),
      });
      const data = await res.json();
      setMsg(data.error ? `Sync failed: ${data.error}` : `Synced ${data.synced ?? 0} programs`);
    } catch {
      setMsg("Sync failed");
    }
    setSyncing((prev) => { const next = new Set(prev); next.delete(id); return next; });
    load();
  }

  async function forceSyncAll() {
    const active = sources.filter((s) => s.isActive);
    setSyncProgress({
      active: true,
      current: 0,
      total: active.length,
      name: "",
      programs: 0,
      errors: [],
    });
    setSyncing(new Set(active.map((s) => s.id)));
    setMsg("");

    let programs = 0;
    const errors: string[] = [];

    for (let i = 0; i < active.length; i++) {
      const source = active[i]!;
      setSyncProgress((p) =>
        p ? { ...p, current: i + 1, name: source.name } : p
      );
      try {
        const res = await fetch("/api/admin/epg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sync: true, sourceId: source.id }),
        });
        const data = await res.json();
        if (data.error) {
          errors.push(`${source.name}: ${data.error}`);
        } else {
          programs += Number(data.programsImported ?? data.synced ?? 0);
        }
      } catch {
        errors.push(`${source.name}: sync failed`);
      }
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
    }

    setSyncProgress(null);
    setSyncing(new Set());
    setMsg(
      errors.length
        ? `Force sync done: ${programs.toLocaleString()} programmes · ${errors.length} error(s)`
        : `Force sync complete: ${programs.toLocaleString()} programmes imported`
    );
    if (errors.length) {
      setSyncProgress({ active: false, current: active.length, total: active.length, name: "", programs, errors });
    }
    load();
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/epg/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditId(null);
    setMsg("Source updated");
    load();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/admin/epg/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    load();
  }

  async function removeSource(id: string) {
    if (!confirm("Delete this EPG source?")) return;
    await fetch(`/api/admin/epg?id=${id}`, { method: "DELETE" });
    setMsg("Source deleted");
    load();
  }

  function startEdit(source: EpgSource) {
    setEditId(source.id);
    setEditForm({ name: source.name, url: source.url, syncEveryHours: source.syncEveryHours });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Manage EPG Sources</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Edit, sync, and force-sync your EPG sources. {sources.length} source{sources.length !== 1 ? "s" : ""} configured.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={forceSyncAll}
            disabled={syncing.size > 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <Zap size={14} />
            Force Sync All
          </button>
          <Link
            href="/admin/epg/add"
            className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Add Source
          </Link>
        </div>
      </div>

      {syncProgress?.active && (
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center justify-between text-sm">
            <span>
              Syncing EPG ({syncProgress.current}/{syncProgress.total})
              {syncProgress.name ? ` — ${syncProgress.name}` : ""}
            </span>
            <span style={{ color: "var(--muted)" }}>
              {Math.round((syncProgress.current / Math.max(syncProgress.total, 1)) * 100)}%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(syncProgress.current / Math.max(syncProgress.total, 1)) * 100}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        </div>
      )}

      {syncProgress && !syncProgress.active && syncProgress.errors.length > 0 && (
        <div className="rounded-lg border px-4 py-3 text-sm space-y-1" style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" }}>
          <p className="font-medium text-red-400">Sync errors</p>
          {syncProgress.errors.slice(0, 8).map((e) => (
            <p key={e} className="text-xs text-red-300">{e}</p>
          ))}
        </div>
      )}

      {msg && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>Loading EPG sources…</div>
      ) : sources.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>
          <p className="text-lg mb-2">No EPG sources configured</p>
          <Link href="/admin/epg/add" className="text-sm" style={{ color: "var(--accent)" }}>Add your first EPG source →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((s) => {
            const isSyncing = syncing.has(s.id);
            const isEditing = editId === s.id;
            const hasError = !!s.lastSyncError;

            return (
              <div
                key={s.id}
                className="rounded-lg border p-4"
                style={{
                  borderColor: hasError ? "rgba(239,68,68,0.3)" : "var(--border)",
                  background: "var(--card)",
                  opacity: s.isActive ? 1 : 0.6,
                }}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Name</label>
                        <input
                          className="w-full rounded border px-3 py-2 text-sm bg-transparent"
                          style={{ borderColor: "var(--border)" }}
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>URL</label>
                        <input
                          className="w-full rounded border px-3 py-2 text-sm bg-transparent"
                          style={{ borderColor: "var(--border)" }}
                          value={editForm.url}
                          onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Sync every (hours)</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded border px-3 py-2 text-sm bg-transparent"
                          style={{ borderColor: "var(--border)" }}
                          value={editForm.syncEveryHours}
                          onChange={(e) => setEditForm({ ...editForm, syncEveryHours: parseInt(e.target.value) || 24 })}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(s.id)}
                        className="px-3 py-1.5 rounded text-sm font-medium cursor-pointer"
                        style={{ background: "var(--accent)", color: "#fff" }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="px-3 py-1.5 rounded text-sm cursor-pointer"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{s.name}</h3>
                        {!s.isActive && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.15)", color: "var(--muted)" }}>
                            Disabled
                          </span>
                        )}
                        {hasError ? (
                          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                            <AlertTriangle size={10} /> Error
                          </span>
                        ) : s.lastSync ? (
                          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                            <CheckCircle2 size={10} /> Synced
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs mt-1 truncate" style={{ color: "var(--muted)" }}>{s.url}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--muted)" }}>
                        <span>Type: {s.sourceType}</span>
                        {s.country && <span>Country: {s.country}</span>}
                        <span>Every {s.syncEveryHours}h</span>
                        {s.channelCount != null && <span>{s.channelCount} channels</span>}
                        {s.lastSync && <span>Last sync: {new Date(s.lastSync).toLocaleString()}</span>}
                      </div>
                      {hasError && (
                        <p className="text-xs mt-1.5 text-red-400">{s.lastSyncError}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => syncSource(s.id)}
                        disabled={isSyncing}
                        className="p-2 rounded hover:bg-white/10 cursor-pointer disabled:opacity-50"
                        title="Sync now"
                      >
                        <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="p-2 rounded hover:bg-white/10 cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(s.id, s.isActive)}
                        className="p-2 rounded hover:bg-white/10 cursor-pointer"
                        title={s.isActive ? "Disable" : "Enable"}
                      >
                        {s.isActive ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSource(s.id)}
                        className="p-2 rounded hover:bg-red-500/20 cursor-pointer text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <Link href="/admin/epg/channels" className="text-sm" style={{ color: "var(--accent)" }}>Channel Mapping →</Link>
        <Link href="/admin/epg/countries" className="text-sm" style={{ color: "var(--accent)" }}>Country EPG →</Link>
        <Link href="/admin/epg/calendar" className="text-sm" style={{ color: "var(--accent)" }}>EPG Calendar →</Link>
        <Link href="/admin/epg/auto-match" className="text-sm font-medium" style={{ color: "#22c55e" }}>⚡ Auto-Match Tool →</Link>
      </div>
    </div>
  );
}
