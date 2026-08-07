"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { ServerTreePicker } from "@/components/server-tree-picker";

type SyncJob = {
  id: string;
  name: string;
  url: string;
  streamType: string;
  syncIntervalMins: number;
  status: string;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastResult: { imported?: number; skipped?: number; error?: string } | null;
  provider: { id: string; name: string } | null;
};

export default function AdminM3uSyncPage() {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    url: "",
    streamType: "MIXED",
    providerId: "",
    categoryId: "",
    serverIds: [] as string[],
    syncIntervalMins: 60,
    autoTmdb: true,
  });
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    fetch("/api/admin/m3u-sync")
      .then((r) => r.json())
      .then((d) => {
        setJobs(d.jobs ?? []);
        setProviders(d.providers ?? []);
      });
  }

  useEffect(() => {
    load();
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/admin/m3u-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          url: form.url.trim(),
          streamType: form.streamType,
          providerId: form.providerId || null,
          categoryId: form.categoryId || null,
          serverId: form.serverIds[0] || null,
          syncIntervalMins: form.syncIntervalMins,
          autoTmdb: form.autoTmdb,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create sync job");
        return;
      }
      setForm({
        name: "",
        url: "",
        streamType: "MIXED",
        providerId: "",
        categoryId: "",
        serverIds: [],
        syncIntervalMins: 60,
        autoTmdb: true,
      });
      load();
    } catch {
      setError("Network error");
    }
  }

  async function syncNow(id: string) {
    setSyncing(id);
    setError("");
    try {
      const res = await fetch("/api/admin/m3u-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", id }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Sync failed");
    } catch {
      setError("Network error during sync");
    } finally {
      setSyncing(null);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this sync job?")) return;
    await fetch(`/api/admin/m3u-sync?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#00c0ef" }}>
          M3U auto-sync
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Scheduled re-pull from upstream IPTV provider M3U URLs. New movies, series, and channels are
          imported automatically; existing URLs are skipped. Runs via{" "}
          <code className="text-xs">nexlify-cron</code> every minute when due.
        </p>
        <p className="text-sm mt-2">
          <Link href="/admin/m3u-sync" className="underline" style={{ color: "var(--accent)" }}>
            M3U auto-sync jobs
          </Link>{" "}
          — alternative scheduled sync with per-job intervals.
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={add}
        className="rounded-lg border p-5 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          Add scheduled sync
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>Label</span>
            <input
              required
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>Content type</span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.streamType}
              onChange={(e) => setForm({ ...form, streamType: e.target.value })}
            >
              <option value="MIXED">Mixed (movies + series)</option>
              <option value="MOVIE">Movies only</option>
              <option value="SERIES">TV series only</option>
              <option value="LIVE">Live channels</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm" style={{ color: "var(--muted)" }}>Provider M3U URL</span>
          <input
            required
            placeholder="https://provider.example/get.php?username=...&type=m3u_plus"
            className="w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
            style={{ borderColor: "var(--border)" }}
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
        </label>
        <div className="grid md:grid-cols-3 gap-4">
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>Sync every (minutes)</span>
            <input
              type="number"
              min={5}
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.syncIntervalMins}
              onChange={(e) => setForm({ ...form, syncIntervalMins: parseInt(e.target.value, 10) || 60 })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>VOD provider (optional)</span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
            >
              <option value="">None</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>Default category</span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Auto from group-title</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <ServerTreePicker
          label="Target streaming server"
          selectedIds={form.serverIds}
          onChange={(serverIds) => setForm({ ...form, serverIds })}
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.autoTmdb}
            onChange={(e) => setForm({ ...form, autoTmdb: e.target.checked })}
          />
          Auto-fetch TMDB metadata on import
        </label>
        <button
          type="submit"
          className="rounded py-2.5 px-5 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add sync job
        </button>
      </form>

      <DataTable
        headers={["Name", "Type", "Interval", "Last sync", "Next sync", "Last result", "Actions"]}
        rows={jobs.map((j) => [
          j.name,
          j.streamType,
          `${j.syncIntervalMins}m`,
          j.lastSyncAt ? formatDateTime(j.lastSyncAt) : "Never",
          j.nextSyncAt ? formatDateTime(j.nextSyncAt) : "—",
          j.lastResult?.error
            ? `Error: ${j.lastResult.error}`
            : j.lastResult
              ? `+${j.lastResult.imported ?? 0} / skip ${j.lastResult.skipped ?? 0}`
              : "—",
          <span key={`a-${j.id}`} className="flex gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff" }}
              disabled={syncing === j.id}
              onClick={() => syncNow(j.id)}
            >
              {syncing === j.id ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--danger)" }}
              onClick={() => remove(j.id)}
            >
              Remove
            </button>
          </span>,
        ])}
      />
    </div>
  );
}
