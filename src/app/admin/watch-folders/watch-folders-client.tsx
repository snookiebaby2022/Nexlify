"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { DualListPicker, type DualListItem } from "@/components/dual-list-picker";
import { ServerTreePicker } from "@/components/server-tree-picker";

type SourceKind = "local" | "m3u" | "file";

type WatchReviewRow = {
  action: "add" | "rename" | "move" | "keep" | "dedupe";
  name: string;
  nextName?: string;
  type: string;
  fromFolder?: string | null;
  toFolder?: string | null;
};

type WatchReview = {
  kind: "m3u" | "folder";
  entries: number;
  add: number;
  keep: number;
  rename: number;
  move: number;
  dedupe: number;
  samples: WatchReviewRow[];
  flags: {
    autoCategory: boolean;
    updateNames: boolean;
    overwriteCategories: boolean;
    onDemand: boolean;
    removeDuplicates: boolean;
  };
};

type WatchFolderRow = {
  id: string;
  name: string;
  path: string;
  type: string;
  importedCount: number;
  lastScan: string | null;
  isActive: boolean;
  autoScanMins: number;
  autoCategory?: boolean;
  updateNames?: boolean;
  overwriteCategories?: boolean;
  onDemand?: boolean;
  removeDuplicates?: boolean;
  isAdult?: boolean;
  categoryId?: string | null;
  serverId?: string | null;
  autoBouquet?: boolean;
  bouquetIds?: string | null;
};

const emptyForm = {
  name: "",
  sourceKind: "m3u" as SourceKind,
  path: "",
  m3uUrl: "",
  type: "LIVE",
  categoryId: "",
  serverIds: [] as string[],
  autoScanMins: 0,
  isAdult: false,
  autoCategory: true,
  updateNames: true,
  overwriteCategories: true,
  onDemand: true,
  removeDuplicates: true,
  autoBouquet: true,
  bouquetIds: [] as string[],
  xtreamOrigin: "",
  xtreamUser: "",
  xtreamPass: "",
};

function folderSourceLabel(path: string): string {
  if (/^https?:\/\//i.test(path)) return "M3U URL";
  if (/\.m3u8?$/i.test(path)) return "M3U file";
  return "Local folder";
}

function buildXtreamUrl(origin: string, username: string, password: string): string {
  const base = origin.trim().replace(/\/+$/, "");
  if (!base || !username.trim() || !password.trim()) return "";
  const withProto = /^https?:\/\//i.test(base) ? base : `http://${base}`;
  const q = new URLSearchParams({
    username: username.trim(),
    password: password.trim(),
    type: "m3u_plus",
    output: "ts",
  });
  return `${withProto}/get.php?${q}`;
}

function scanIntervalLabel(mins: number): string {
  if (!mins || mins <= 0) return "Manual only";
  if (mins < 60) return `Every ${mins} min`;
  if (mins % 60 === 0) return `Every ${mins / 60}h`;
  return `Every ${mins} min`;
}

export function AdminWatchFoldersClient({
  initialFolders = [],
  initialVodHint = "",
}: {
  initialFolders?: WatchFolderRow[];
  initialVodHint?: string;
}) {
  const [folders, setFolders] = useState<WatchFolderRow[]>(initialFolders);
  const [categories, setCategories] = useState<{ id: string; name: string; type?: string }[]>([]);
  const [bouquets, setBouquets] = useState<DualListItem[]>([]);
  const [vodHint, setVodHint] = useState(initialVodHint);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [m3uFileName, setM3uFileName] = useState("");
  const [m3uContent, setM3uContent] = useState("");
  const [scanning, setScanning] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [review, setReview] = useState<WatchReview | null>(null);
  const [reviewSourceId, setReviewSourceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  function load() {
    fetch("/api/admin/watch-folders")
      .then((r) => r.json())
      .then((d) => {
        setFolders(d.folders);
        const v = d.vodStorage;
        if (v?.localMountPath) {
          setVodHint(`rclone/S3 mount: ${v.localMountPath}`);
        } else if (v?.rcloneRemote) {
          setVodHint(
            `rclone remote ${v.rcloneRemote}${v.rclonePath || ""} — mount it locally then add that path here.`
          );
        }
      });
  }

  useEffect(() => {
    if (initialFolders.length) return;
    load();
  }, [initialFolders.length]);

  useEffect(() => {
    const type = form.type === "LIVE" || form.type === "MOVIE" || form.type === "SERIES" ? form.type : "";
    fetch(`/api/admin/categories${type ? `?type=${type}` : ""}`)
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, [form.type]);

  useEffect(() => {
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) =>
        setBouquets(
          (d.bouquets ?? []).map((b: { id: string; name: string }) => ({
            id: b.id,
            label: b.name,
          }))
        )
      )
      .catch(() => setBouquets([]));
  }, []);

  function m3uFlags() {
    return {
      autoCategory: form.autoCategory,
      updateNames: form.updateNames,
      overwriteCategories: form.overwriteCategories,
      onDemand: form.onDemand,
      removeDuplicates: form.removeDuplicates,
      autoBouquet: form.autoBouquet,
      bouquetIds: form.bouquetIds,
    };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    const path =
      form.sourceKind === "m3u"
        ? form.m3uUrl.trim()
        : form.sourceKind === "file"
          ? form.path.trim() || "upload"
          : form.path.trim();
    if (form.sourceKind === "m3u" && !path) {
      setError("M3U URL is required.");
      return;
    }
    if (form.sourceKind === "local" && !path) {
      setError("Local folder or .m3u path is required.");
      return;
    }
    if (form.sourceKind === "file" && !m3uContent && !editingId) {
      setError("Choose an M3U file.");
      return;
    }
    try {
      const payload = {
        name: form.name,
        path,
        type: form.type,
        sourceKind: form.sourceKind === "local" ? "local" : "m3u",
        categoryId: form.categoryId || null,
        serverId: form.serverIds[0] || null,
        autoScanMins: form.autoScanMins,
        isAdult: form.isAdult,
        m3uContent: m3uContent || undefined,
        ...m3uFlags(),
      };
      const res = await fetch("/api/admin/watch-folders", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save watch folder");
        return;
      }
      setForm(emptyForm);
      setEditingId(null);
      setM3uContent("");
      setM3uFileName("");
      setOk(editingId ? "Watch source updated." : "Watch source added. Click Scan now to import.");
      load();
    } catch {
      setError("Network error while saving watch folder");
    }
  }

  async function scan(id: string) {
    setScanning(id);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/admin/watch-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan: true, id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Scan failed");
      } else {
        setReview(null);
        setReviewSourceId(null);
        setOk(
          `Scan: ${data.imported ?? 0} new, ${data.skipped ?? 0} existing, ${data.updated ?? 0} updated${
            data.deduped ? `, ${data.deduped} exact-name copies off` : ""
          }.`
        );
      }
    } catch {
      setError("Network error during scan");
    } finally {
      setScanning(null);
      load();
    }
  }

  function reviewPayload(extra: Record<string, unknown> = {}) {
    const path =
      form.sourceKind === "m3u"
        ? form.m3uUrl.trim()
        : form.sourceKind === "file"
          ? form.path.trim()
          : form.path.trim();
    return {
      review: true,
      path: path || undefined,
      type: form.type,
      categoryId: form.categoryId || null,
      m3uContent: m3uContent || undefined,
      ...m3uFlags(),
      ...extra,
    };
  }

  async function runReview(key: string, payload: Record<string, unknown>) {
    setReviewing(key);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/admin/watch-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setReview(null);
        setReviewSourceId(null);
        setError(data.error ?? "Review failed");
        return;
      }
      setReview(data.review);
      setReviewSourceId(typeof payload.id === "string" ? payload.id : null);
      setOk("Review only — nothing was written. Scan now applies this.");
    } catch {
      setError("Network error during review");
    } finally {
      setReviewing(null);
    }
  }

  function reviewSaved(id: string) {
    return runReview(id, { review: true, id });
  }

  function previewForm() {
    const path =
      form.sourceKind === "m3u"
        ? form.m3uUrl.trim()
        : form.path.trim();
    if (form.sourceKind === "file" && !m3uContent && !editingId) {
      setError("Choose an M3U file to preview.");
      return;
    }
    if (form.sourceKind !== "file" && !path && !editingId) {
      setError("Add a path or M3U URL to preview.");
      return;
    }
    return runReview(editingId ?? "form", reviewPayload(editingId ? { id: editingId } : {}));
  }

  function editFolder(f: WatchFolderRow) {
    const remote = /^https?:\/\//i.test(f.path);
    const file = /\.m3u8?$/i.test(f.path);
    setEditingId(f.id);
    setM3uContent("");
    setM3uFileName("");
    setForm({
      ...emptyForm,
      name: f.name,
      sourceKind: remote ? "m3u" : file ? "file" : "local",
      path: remote ? "" : f.path,
      m3uUrl: remote ? f.path : "",
      type: f.type,
      categoryId: f.categoryId ?? "",
      serverIds: f.serverId ? [f.serverId] : [],
      autoScanMins: f.autoScanMins ?? 0,
      isAdult: f.isAdult === true,
      autoCategory: f.autoCategory !== false,
      updateNames: f.updateNames !== false,
      overwriteCategories: f.overwriteCategories !== false,
      onDemand: f.onDemand !== false,
      removeDuplicates: f.removeDuplicates === true,
      autoBouquet: f.autoBouquet !== false,
      bouquetIds: String(f.bouquetIds ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    });
    setOk(`Editing “${f.name}”. Save to apply, then Scan now.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleActive(f: WatchFolderRow) {
    setError("");
    const res = await fetch("/api/admin/watch-folders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, isActive: !f.isActive }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update status");
      return;
    }
    load();
  }

  function onM3uFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setM3uFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setM3uContent(String(reader.result ?? ""));
    };
    reader.readAsText(file);
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
          Import from a local folder, an uploaded M3U file, or a provider playlist URL (get.php / m3u_plus).
          Use Review first to see adds, renames, folder moves, and exact-name copies — nothing is written
          until you Scan. Live defaults to on-demand. Auto-scan needs nexlify-cron.
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
      {ok && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "rgba(34,197,94,0.08)" }}>
          {ok}
        </div>
      )}
      {vodHint && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {vodHint}{" "}
          <Link href="/admin/settings/vod-storage" className="underline" style={{ color: "var(--accent)" }}>
            Rclone / S3 settings
          </Link>
        </p>
      )}

      <form
        onSubmit={add}
        className="rounded-lg border p-5 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          {editingId ? "Edit watch source" : "Add watch source"}
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
              <option value="LIVE">Live channels</option>
              <option value="MOVIE">Movies only</option>
              <option value="SERIES">TV series only</option>
              <option value="MIXED">Mixed (live + VOD)</option>
              {form.sourceKind === "local" && <option value="M3U">Local M3U files in folder</option>}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={form.sourceKind === "m3u"}
              onChange={() => setForm({ ...form, sourceKind: "m3u", type: form.type === "M3U" ? "LIVE" : form.type })}
            />
            Provider M3U URL
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={form.sourceKind === "file"}
              onChange={() => setForm({ ...form, sourceKind: "file", type: form.type === "M3U" ? "LIVE" : form.type })}
            />
            Upload M3U file
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={form.sourceKind === "local"}
              onChange={() => setForm({ ...form, sourceKind: "local" })}
            />
            Local folder / file path
          </label>
        </div>

        {form.sourceKind === "local" ? (
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Folder or .m3u path on the server
            </span>
            <input
              placeholder="/media/vod/movies or /media/playlists/uk.m3u"
              className="w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
              style={{ borderColor: "var(--border)" }}
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
            />
          </label>
        ) : form.sourceKind === "file" ? (
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              M3U / M3U8 file
            </span>
            <input type="file" accept=".m3u,.m3u8,text/plain" onChange={onM3uFile} className="text-sm" />
            {m3uFileName && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {m3uFileName}
                {m3uContent ? ` · ${m3uContent.length.toLocaleString()} chars` : ""}
              </span>
            )}
          </label>
        ) : (
          <div className="space-y-3">
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
            <details className="text-sm">
              <summary className="cursor-pointer" style={{ color: "var(--muted)" }}>
                Build URL from Xtream host / username / password
              </summary>
              <div className="grid md:grid-cols-3 gap-2 mt-2">
                <input
                  placeholder="http://host:8080"
                  className="rounded border px-3 py-2 bg-transparent font-mono text-xs"
                  style={{ borderColor: "var(--border)" }}
                  value={form.xtreamOrigin}
                  onChange={(e) => setForm({ ...form, xtreamOrigin: e.target.value })}
                />
                <input
                  placeholder="username"
                  className="rounded border px-3 py-2 bg-transparent font-mono text-xs"
                  style={{ borderColor: "var(--border)" }}
                  value={form.xtreamUser}
                  onChange={(e) => setForm({ ...form, xtreamUser: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="password"
                  className="rounded border px-3 py-2 bg-transparent font-mono text-xs"
                  style={{ borderColor: "var(--border)" }}
                  value={form.xtreamPass}
                  onChange={(e) => setForm({ ...form, xtreamPass: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="mt-2 text-xs underline"
                style={{ color: "var(--accent)" }}
                onClick={() => {
                  const url = buildXtreamUrl(form.xtreamOrigin, form.xtreamUser, form.xtreamPass);
                  if (!url) {
                    setError("Host, username, and password are required to build the URL.");
                    return;
                  }
                  setForm({ ...form, m3uUrl: url });
                  setOk("Filled the M3U URL from Xtream details.");
                }}
              >
                Fill M3U URL
              </button>
            </details>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Default category (existing panel folders)
            </span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">From playlist group-title</option>
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

        <div className="space-y-1">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Also add to these bouquets
          </p>
          <DualListPicker
            items={bouquets}
            selectedIds={form.bouquetIds}
            onChange={(bouquetIds) => setForm({ ...form, bouquetIds })}
            availableTitle="Available bouquets"
            selectedTitle="Assigned bouquets"
          />
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            Provider group-title still creates bouquets when the checkbox below is on. These are extra
            packages every imported stream is attached to.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoCategory}
              onChange={(e) => setForm({ ...form, autoCategory: e.target.checked })}
            />
            Create categories from group-title
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoBouquet}
              onChange={(e) => setForm({ ...form, autoBouquet: e.target.checked })}
            />
            Create/sync bouquets from group-title
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.updateNames}
              onChange={(e) => setForm({ ...form, updateNames: e.target.checked })}
            />
            Update names, logos, and EPG on rescan
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.overwriteCategories}
              onChange={(e) => setForm({ ...form, overwriteCategories: e.target.checked })}
            />
            Overwrite existing stream folders
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.onDemand}
              onChange={(e) => setForm({ ...form, onDemand: e.target.checked })}
            />
            Import live as on-demand
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.removeDuplicates}
              onChange={(e) => setForm({ ...form, removeDuplicates: e.target.checked })}
            />
            Remove exact-name copies in this playlist
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isAdult}
              onChange={(e) => setForm({ ...form, isAdult: e.target.checked })}
            />
            Mark imported content as adult
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded py-2.5 px-5 font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {editingId ? "Save watch source" : "Add watch source"}
          </button>
          <button
            type="button"
            className="rounded py-2.5 px-5 font-medium cursor-pointer border"
            style={{ borderColor: "var(--border)" }}
            disabled={reviewing === (editingId ?? "form")}
            onClick={() => void previewForm()}
          >
            {reviewing === (editingId ?? "form") ? "Reviewing…" : "Preview scan"}
          </button>
          {editingId && (
            <button
              type="button"
              className="rounded py-2.5 px-5 font-medium cursor-pointer border"
              style={{ borderColor: "var(--border)" }}
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setM3uContent("");
                setM3uFileName("");
                setOk("");
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {review && (
        <div
          className="rounded-lg border p-5 space-y-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
                Scan review
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                {review.entries.toLocaleString()} playlist items. Nothing has been written yet.
                {review.flags.onDemand ? " Live would import as on-demand." : ""}
                {review.flags.removeDuplicates ? " Exact-name copies in this playlist would be turned off." : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {reviewSourceId && (
                <button
                  type="button"
                  className="rounded py-2 px-4 text-sm font-medium cursor-pointer"
                  style={{ background: "var(--accent)", color: "#fff" }}
                  disabled={scanning === reviewSourceId}
                  onClick={() => scan(reviewSourceId)}
                >
                  {scanning === reviewSourceId ? "Scanning…" : "Apply this scan"}
                </button>
              )}
              <button
                type="button"
                className="rounded py-2 px-4 text-sm cursor-pointer border"
                style={{ borderColor: "var(--border)" }}
                onClick={() => {
                  setReview(null);
                  setReviewSourceId(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            {(
              [
                ["Add", review.add],
                ["Keep", review.keep],
                ["Rename", review.rename],
                ["Move folder", review.move],
                ["Turn off copies", review.dedupe],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {label}
                </div>
                <div className="text-lg font-semibold">{n.toLocaleString()}</div>
              </div>
            ))}
          </div>
          {review.samples.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th className="text-left font-medium py-1 pr-3">Action</th>
                    <th className="text-left font-medium py-1 pr-3">Name</th>
                    <th className="text-left font-medium py-1 pr-3">Folder</th>
                    <th className="text-left font-medium py-1">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {review.samples.map((row, i) => (
                    <tr key={`${row.action}-${row.name}-${i}`}>
                      <td className="py-1 pr-3 capitalize">{row.action === "dedupe" ? "turn off" : row.action}</td>
                      <td className="py-1 pr-3">
                        {row.nextName ? (
                          <>
                            <span className="line-through opacity-60">{row.name}</span>
                            {" → "}
                            {row.nextName}
                          </>
                        ) : (
                          row.name
                        )}
                      </td>
                      <td className="py-1 pr-3">
                        {row.fromFolder && row.toFolder && row.fromFolder !== row.toFolder
                          ? `${row.fromFolder} → ${row.toFolder}`
                          : row.toFolder || row.fromFolder || "—"}
                      </td>
                      <td className="py-1">{row.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <DataTable
        headers={["Name", "Status", "Source", "Type", "Schedule", "Imported", "Last scan", "Actions"]}
        rows={folders.map((f) => [
          f.name,
          <span
            key={`st-${f.id}`}
            className="text-xs px-2 py-0.5 rounded-full inline-block"
            style={{
              background: f.isActive ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
              color: f.isActive ? "#22c55e" : "var(--muted)",
            }}
          >
            {f.isActive ? "Active" : "Paused"}
          </span>,
          <span key={`src-${f.id}`} className="text-xs truncate max-w-xs block" title={f.path}>
            <span className="opacity-70">{folderSourceLabel(f.path)} · </span>
            <span className="font-mono">{f.path}</span>
          </span>,
          f.type,
          scanIntervalLabel(f.autoScanMins ?? 0),
          f.importedCount.toLocaleString(),
          f.lastScan ? formatDateTime(f.lastScan) : "Never",
          <span key={`a-${f.id}`} className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded cursor-pointer border"
              style={{ borderColor: "var(--border)" }}
              disabled={reviewing === f.id}
              onClick={() => void reviewSaved(f.id)}
            >
              {reviewing === f.id ? "Reviewing…" : "Review"}
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff" }}
              disabled={scanning === f.id}
              onClick={() => scan(f.id)}
            >
              {scanning === f.id ? "Scanning…" : "Scan now"}
            </button>
            <button type="button" className="text-xs cursor-pointer underline" onClick={() => editFolder(f)}>
              Edit
            </button>
            <button type="button" className="text-xs cursor-pointer underline" onClick={() => void toggleActive(f)}>
              {f.isActive ? "Pause" : "Resume"}
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
