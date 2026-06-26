"use client";

import { useEffect, useState } from "react";
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
  });
  const [scanning, setScanning] = useState<string | null>(null);

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
    const path =
      form.sourceKind === "m3u"
        ? form.m3uUrl.trim()
        : form.path.trim();
    if (!path) {
      alert(form.sourceKind === "m3u" ? "M3U URL is required." : "Local folder path is required.");
      return;
    }
    await fetch("/api/admin/watch-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        path,
        type: form.type,
        categoryId: form.categoryId || null,
        serverId: form.serverIds[0] || null,
        autoScanMins: form.autoScanMins,
      }),
    });
    setForm({
      name: "",
      sourceKind: "local",
      path: "",
      m3uUrl: "",
      type: "MIXED",
      categoryId: "",
      serverIds: [],
      autoScanMins: 0,
    });
    load();
  }

  async function scan(id: string) {
    setScanning(id);
    await fetch("/api/admin/watch-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scan: true, id }),
    });
    setScanning(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this watch folder?")) return;
    await fetch(`/api/admin/watch-folders?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#00c0ef" }}>
          Watch folders
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Auto-import movies and TV series from a local directory or remote M3U playlist URL.
        </p>
      </div>

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
              <option value="M3U">M3U playlist</option>
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
              onChange={() => setForm({ ...form, sourceKind: "m3u", type: "M3U" })}
            />
            Remote M3U URL
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
              placeholder="https://example.com/playlist.m3u"
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
