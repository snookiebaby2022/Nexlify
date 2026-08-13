"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { ServerTreePicker } from "@/components/server-tree-picker";

type SourceKind = "local" | "m3u";

export default function AdminWatchFoldersPage() {
  const [folders, setFolders] = useState<
    {
      id: string;
      name: string;
      path: string;
      type: string;
      importedCount: number;
      lastScan: string | null;
      isActive: boolean;
    }[]
  >([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    sourceKind: "local" as SourceKind,
    path: "",
    m3uUrl: "",
    type: "MIXED",
    categoryId: "",
    serverIds: [] as string[],
    autoScanMins: 0,
    isAdult: false,
  });
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    fetch("/api/admin/watch-folders")
      .then((r) => r.json())
      .then((d) => setFolders(d.folders));
  }

  useEffect(() => {
    load();
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const path =
      form.sourceKind === "m3u"
        ? form.m3uUrl.trim()
        : form.path.trim();
    if (!path) {
      setError(form.sourceKind === "m3u" ? "M3U URL is required." : "Local folder path is required.");
      return;
    }
    try {
      const res = await fetch("/api/admin/watch-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          path,
          type: form.type,
          sourceKind: form.sourceKind,
          categoryId: form.categoryId || null,
          serverId: form.serverIds[0] || null,
          autoScanMins: form.autoScanMins,
          isAdult: form.isAdult,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add watch folder");
        return;
      }
      setForm({
        name: "",
        sourceKind: "local",
        path: "",
        m3uUrl: "",
        type: "MIXED",
        categoryId: "",
        serverIds: [],
        autoScanMins: 0,
        isAdult: false,
      });
      load();
    } catch {
      setError("Network error while adding watch folder");
    }
  }

  async function scan(id: string) {
    setScanning(id);
    setError("");
    try {
      const res = await fetch("/api/admin/watch-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan: true, id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Scan failed");
      }
    } catch {
      setError("Network error during scan");
    } finally {
      setScanning(null);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this watch folder?")) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/watch-folders?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove watch folder");
        return;
      }
      load();
    } catch {
      setError("Network error while removing watch folder");
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#00c0ef" }}>
          Watch folders
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Auto-import movies and TV series from a local directory or upstream IPTV provider M3U URL.
          Set auto-scan interval to re-pull new content from the provider on a schedule (requires nexlify-cron).
        </p>
        <p className="text-sm mt-2">
          <Link href="/admin/m3u-sync" className="underline" style={{ color: "var(--accent)" }}>
            M3U auto-sync jobs
          </Link>{" "}
          — dedicated scheduled sync with custom intervals per provider URL.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <form
        onSubmit={add}
        className="rounded-lg border p-5 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          Add watch source
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Label
            </span>
            <input
              placeholder="My movies library"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Content type
            </span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="MIXED">Mixed (movies + series)</option>
              <option value="MOVIE">Movies only</option>
              <option value="SERIES">TV series only</option>
              {form.sourceKind === "local" && <option value="M3U">Local M3U file in folder</option>}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={form.sourceKind === "local"}
              onChange={() => setForm({ ...form, sourceKind: "local" })}
            />
            Local folder (on server)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={form.sourceKind === "m3u"}
              onChange={() => setForm({ ...form, sourceKind: "m3u" })}
            />
            Remote M3U URL (provider playlist)
          </label>
        </div>

        {form.sourceKind === "local" ? (
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Folder path (under MEDIA_IMPORT_ROOT)
            </span>
            <input
              placeholder="/media/vod/movies"
              className="w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
              style={{ borderColor: "var(--border)" }}
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
            />
          </label>
        ) : (
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              M3U playlist URL
            </span>
            <input
              placeholder="https://provider.example/get.php?username=...&type=m3u_plus&output=ts"
              className="w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
              style={{ borderColor: "var(--border)" }}
              value={form.m3uUrl}
              onChange={(e) => setForm({ ...form, m3uUrl: e.target.value })}
            />
          </label>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Default category
            </span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Without category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Auto-scan interval (minutes, 0 = manual)
            </span>
            <input
              type="number"
              min={0}
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.autoScanMins}
              onChange={(e) => setForm({ ...form, autoScanMins: parseInt(e.target.value, 10) || 0 })}
            />
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
            checked={form.isAdult}
            onChange={(e) => setForm({ ...form, isAdult: e.target.checked })}
          />
          Mark imported content as adult
        </label>

        <button
          type="submit"
          className="rounded py-2.5 px-5 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add watch folder
        </button>
      </form>

      <DataTable
        headers={["Name", "Source", "Type", "Imported", "Last scan", "Actions"]}
        rows={folders.map((f) => [
          f.name,
          <span key={f.id} className="text-xs font-mono truncate max-w-xs block" title={f.path}>
            {f.path}
          </span>,
          f.type,
          f.importedCount,
          f.lastScan ? formatDateTime(f.lastScan) : "Never",
          <span key={`a-${f.id}`} className="flex gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff" }}
              disabled={scanning === f.id}
              onClick={() => scan(f.id)}
            >
              {scanning === f.id ? "Scanning…" : "Scan now"}
            </button>
            <button
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--danger)" }}
              onClick={() => remove(f.id)}
            >
              Remove
            </button>
          </span>,
        ])}
      />
    </div>
  );
}
