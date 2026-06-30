"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { parseM3u, type M3uEntry } from "@/lib/m3u-parser";
import { DualListPicker, type DualListItem } from "@/components/dual-list-picker";
import { ServerTreePicker } from "@/components/server-tree-picker";
import {
  FormField,
  formInputClass,
  formInputStyle,
  formSelectClass,
} from "@/components/form-page-shell";

type ImportSource = "m3u" | "file" | "paste";

type VodMeta = {
  directSource: boolean;
  nativeFrames: boolean;
  isAdult: boolean;
  outputFormats: string;
  userAgent: string;
  proxy: string;
  headers: string[];
  transcodeProfile: string;
  serverIds: string[];
  bouquetIds: string[];
  removeSubtitles: boolean;
  notes: string;
};

function YesNo({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="text-sm">
      <div className="flex items-center gap-1 mb-1" style={{ color: "var(--muted)" }}>
        {label}
        {hint && (
          <span title={hint}>
            <Info size={14} className="opacity-70" />
          </span>
        )}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={value} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={!value} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold cursor-pointer"
        style={{ background: "rgba(94,184,232,0.12)", color: "var(--accent)" }}
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

function entriesToPickerItems(entries: M3uEntry[]): DualListItem[] {
  return entries.map((e) => ({
    id: e.url,
    label: e.name,
    group: e.group,
    sublabel: e.url.length > 60 ? `${e.url.slice(0, 57)}…` : e.url,
  }));
}

export function VodImportForm({
  streamType,
  title,
  manageHref,
  manageLabel,
}: {
  streamType: "MOVIE" | "SERIES";
  title: string;
  manageHref: string;
  manageLabel: string;
}) {
  const [source, setSource] = useState<ImportSource>("m3u");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [parsed, setParsed] = useState<M3uEntry[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [bouquetItems, setBouquetItems] = useState<DualListItem[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [autoCategory, setAutoCategory] = useState(true);
  const [autoTmdb, setAutoTmdb] = useState(true);
  const [meta, setMeta] = useState<VodMeta>({
    directSource: true,
    nativeFrames: false,
    isAdult: false,
    outputFormats: "mp4",
    userAgent: "",
    proxy: "",
    headers: [""],
    transcodeProfile: "none",
    serverIds: [],
    bouquetIds: [],
    removeSubtitles: false,
    notes: "",
  });

  const pickerItems = useMemo(() => entriesToPickerItems(parsed), [parsed]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) =>
        setBouquetItems(
          (d.bouquets ?? []).map((b: { id: string; name: string }) => ({
            id: b.id,
            label: b.name,
          }))
        )
      );
  }, []);

  async function loadPlaylist() {
    setLoading(true);
    setResult("");
    try {
      let text = content;
      if (source === "m3u" && url.trim()) {
        const res = await fetch("/api/admin/import/m3u", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", url: url.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch playlist");
        text = data.content ?? "";
      }
      if (!text.trim()) {
        setResult("Paste M3U content, upload a file, or enter a playlist URL.");
        setParsed([]);
        setSelectedUrls([]);
        return;
      }
      const entries = parseM3u(text);
      setParsed(entries);
      setSelectedUrls(entries.map((e) => e.url));
      setResult(`Loaded ${entries.length} ${streamType === "MOVIE" ? "movie" : "series"} entries.`);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Failed to load playlist");
      setParsed([]);
      setSelectedUrls([]);
    } finally {
      setLoading(false);
    }
  }

  async function onM3uFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setSource("file");
    const entries = parseM3u(text);
    setParsed(entries);
    setSelectedUrls(entries.map((ent) => ent.url));
    setResult(`Loaded ${entries.length} entries from file.`);
  }

  async function runImport() {
    if (!selectedUrls.length) {
      setResult("Select at least one entry to import.");
      return;
    }
    setImporting(true);
    setResult("Importing…");
    const body = {
      url: source === "m3u" && url.trim() ? url.trim() : undefined,
      content: source !== "m3u" || !url.trim() ? content || undefined : undefined,
      streamType,
      categoryId: autoCategory ? null : categoryId || null,
      autoCategory,
      autoTmdb,
      selectedUrls,
      serverId: meta.serverIds[0] ?? null,
      serverIds: meta.serverIds,
      bouquetIds: meta.bouquetIds,
      importMeta: {
        directSource: meta.directSource,
        nativeFrames: meta.nativeFrames,
        isAdult: meta.isAdult,
        outputFormats: meta.outputFormats,
        userAgent: meta.userAgent,
        proxy: meta.proxy,
        headers: meta.headers.filter((h) => h.trim()),
        transcodeProfile: meta.transcodeProfile,
        serverIds: meta.serverIds,
        bouquetIds: meta.bouquetIds,
        removeSubtitles: meta.removeSubtitles,
        notes: meta.notes,
      },
    };
    const res = await fetch("/api/admin/import/m3u", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setImporting(false);
    setResult(
      res.ok
        ? `Imported ${data.imported}, skipped ${data.skipped}${
            data.errors?.length ? ` · ${data.errors.slice(0, 3).join("; ")}` : ""
          }`
        : data.error ?? "Import failed"
    );
  }

  return (
    <div className="space-y-6 max-w-5xl pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Import multiple {streamType === "MOVIE" ? "movies" : "series"} from M3U/URL (default), file, or pasted
            playlist. Select entries, configure metadata, then import.
          </p>
        </div>
        <Link
          href={manageHref}
          className="text-sm font-medium rounded-lg border px-4 py-2 hover:opacity-90"
          style={{ borderColor: "var(--border)", color: "var(--accent)" }}
        >
          {manageLabel}
        </Link>
      </div>

      <div
        className="rounded-lg border p-4 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <FormField label="Import from">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={source}
            onChange={(e) => setSource(e.target.value as ImportSource)}
          >
            <option value="m3u">M3U / URL (recommended)</option>
            <option value="file">File upload</option>
            <option value="paste">Paste content</option>
          </select>
        </FormField>

        {source === "m3u" && (
          <FormField label="Playlist URL">
            <input
              className={formInputClass}
              style={formInputStyle}
              placeholder="https://example.com/movies.m3u"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </FormField>
        )}

        {(source === "paste" || source === "file") && (
          <FormField label="M3U content">
            <textarea
              className={`${formInputClass} min-h-[120px] font-mono text-xs`}
              style={formInputStyle}
              placeholder="#EXTM3U…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </FormField>
        )}

        {source === "file" && (
          <input type="file" accept=".m3u,.m3u8,text/*" onChange={onM3uFile} className="text-sm" />
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={loadPlaylist}
            className="rounded px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "Loading…" : "Load playlist"}
          </button>
          {parsed.length > 0 && (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="rounded border px-4 py-2 text-sm cursor-pointer"
              style={{ borderColor: "var(--border)" }}
            >
              Preview
            </button>
          )}
        </div>

        {parsed.length > 0 && (
          <div
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ background: "rgba(251, 191, 36, 0.2)", color: "var(--fg)" }}
          >
            Import list: {parsed.length} available · {selectedUrls.length} selected for import
          </div>
        )}
      </div>

      {parsed.length > 0 && (
        <Section title="Select entries to import" defaultOpen>
          <DualListPicker
            items={pickerItems}
            selectedIds={selectedUrls}
            onChange={setSelectedUrls}
            availableTitle="Available entries"
            selectedTitle="Selected for import"
            availableHint="Double-click or use arrows to move entries into the import list."
            selectedHint="Only selected entries will be created in the panel."
            searchPlaceholder="Filter…"
            emptyMessage="No entries"
          />
        </Section>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <FormField label="Category">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={categoryId}
            disabled={autoCategory}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Without category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <YesNo
          label="Auto category"
          hint="Derive category from M3U group-title or TMDB genre when no category is set"
          value={autoCategory}
          onChange={setAutoCategory}
        />
      </div>

      <FormField label="Notes">
        <textarea
          className={formInputClass}
          style={formInputStyle}
          rows={2}
          placeholder="Import notes (optional)"
          value={meta.notes}
          onChange={(e) => setMeta({ ...meta, notes: e.target.value })}
        />
      </FormField>

      <div className="grid sm:grid-cols-2 gap-4">
        <YesNo
          label="Direct source (return direct URL)"
          hint="Clients receive the upstream URL instead of a proxied panel URL"
          value={meta.directSource}
          onChange={(v) => setMeta({ ...meta, directSource: v })}
        />
        <YesNo
          label="Automatically add TMDB"
          hint="Fetch poster and metadata from TMDB when a key is configured (Settings → TMDB)"
          value={autoTmdb}
          onChange={setAutoTmdb}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Stream options">
          <YesNo
            label="Read input source in native frames"
            value={meta.nativeFrames}
            onChange={(v) => setMeta({ ...meta, nativeFrames: v })}
          />
          <YesNo label="Is adult content" value={meta.isAdult} onChange={(v) => setMeta({ ...meta, isAdult: v })} />
          <FormField label="Output formats">
            <div className="flex flex-wrap gap-4 text-sm">
              {(["mkv", "mp4", "avi"] as const).map((fmt) => {
                const selected = meta.outputFormats
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean);
                const on = selected.includes(fmt);
                return (
                  <label key={fmt} className="flex items-center gap-1.5 cursor-pointer uppercase">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const set = new Set(selected);
                        if (on) set.delete(fmt);
                        else set.add(fmt);
                        const next = ["mkv", "mp4", "avi"].filter((f) => set.has(f));
                        setMeta({ ...meta, outputFormats: next.length ? next.join(",") : "mp4" });
                      }}
                    />
                    {fmt}
                  </label>
                );
              })}
            </div>
          </FormField>
          <YesNo
            label="Remove subtitles"
            value={meta.removeSubtitles}
            onChange={(v) => setMeta({ ...meta, removeSubtitles: v })}
          />
        </Section>

        <Section title="User agent / proxy / headers">
          <FormField label="User agent">
            <input
              className={formInputClass}
              style={formInputStyle}
              placeholder="User Agent"
              value={meta.userAgent}
              onChange={(e) => setMeta({ ...meta, userAgent: e.target.value })}
            />
          </FormField>
          <FormField label="Proxy">
            <input
              className={formInputClass}
              style={formInputStyle}
              placeholder="ip:port"
              value={meta.proxy}
              onChange={(e) => setMeta({ ...meta, proxy: e.target.value })}
            />
          </FormField>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Headers
              </span>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border cursor-pointer"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setMeta({ ...meta, headers: [...meta.headers, ""] })}
              >
                + Header
              </button>
            </div>
            {meta.headers.map((h, i) => (
              <input
                key={i}
                className={`${formInputClass} mb-2 font-mono text-xs`}
                style={formInputStyle}
                placeholder="cookie:…"
                value={h}
                onChange={(e) => {
                  const next = [...meta.headers];
                  next[i] = e.target.value;
                  setMeta({ ...meta, headers: next });
                }}
              />
            ))}
          </div>
        </Section>
      </div>

      <Section title="Streaming servers">
        <ServerTreePicker
          selectedIds={meta.serverIds}
          onChange={(serverIds) => setMeta({ ...meta, serverIds })}
        />
      </Section>

      <Section title="Add stream to bouquets">
        <DualListPicker
          items={bouquetItems}
          selectedIds={meta.bouquetIds}
          onChange={(bouquetIds) => setMeta({ ...meta, bouquetIds })}
          availableTitle="Available bouquets"
          selectedTitle="Assign to bouquets"
        />
      </Section>

      <Section title="Transcode profile">
        <FormField label="Profile">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={meta.transcodeProfile}
            onChange={(e) => setMeta({ ...meta, transcodeProfile: e.target.value })}
          >
            <option value="none">Without transcode</option>
            <option value="veryfast">Very fast</option>
            <option value="fast">Fast</option>
            <option value="medium">Medium</option>
            <option value="slow">Slow</option>
          </select>
        </FormField>
      </Section>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          disabled={importing || !selectedUrls.length}
          onClick={runImport}
          className="btn-positive rounded px-6 py-2.5 font-medium cursor-pointer disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import selected"}
        </button>
        {result && (
          <p className="text-sm self-center" style={{ color: "var(--muted)" }}>
            {result}
          </p>
        )}
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 bg-black/50 cursor-pointer"
            aria-label="Close"
            onClick={() => setPreviewOpen(false)}
          />
          <div
            className="relative max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border p-5"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <h2 className="text-lg font-semibold mb-3">Playlist preview</h2>
            <ul className="space-y-2 text-sm font-mono">
              {parsed.slice(0, 50).map((e) => (
                <li key={e.url} className="border-b pb-2" style={{ borderColor: "var(--border)" }}>
                  <span className="font-medium">{e.name}</span>
                  {e.group && (
                    <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                      [{e.group}]
                    </span>
                  )}
                  <div className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>
                    {e.url}
                  </div>
                </li>
              ))}
            </ul>
            {parsed.length > 50 && (
              <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                Showing first 50 of {parsed.length} entries.
              </p>
            )}
            <button
              type="button"
              className="mt-4 rounded border px-4 py-2 text-sm cursor-pointer"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setPreviewOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
