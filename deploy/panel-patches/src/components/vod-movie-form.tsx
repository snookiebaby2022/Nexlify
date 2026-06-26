"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TmdbMetadataSection, emptyTmdbMeta, type TmdbMetaFields } from "@/components/tmdb-metadata-section";
import { ServerTreePicker } from "@/components/server-tree-picker";
import { DualListPicker, type DualListItem } from "@/components/dual-list-picker";
import { ProviderSourceFields } from "@/components/provider-source-fields";
import {
  FormField,
  formInputClass,
  formInputStyle,
  formSelectClass,
} from "@/components/form-page-shell";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

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
            <Info size={14} />
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

type VodMeta = {
  location: "remote" | "local";
  doNotEncode: boolean;
  symlinkSource: boolean;
  directSource: boolean;
  removeSubtitles: boolean;
  nativeFrames: boolean;
  isAdult: boolean;
  outputFormats: string;
  customMap: string;
  userAgent: string;
  proxy: string;
  headers: string[];
  serverIds: string[];
  transcodeProfile: string;
  bouquetIds: string[];
};

function encodeVodMeta(meta: VodMeta): string | null {
  const payload = { v: 1, ...meta };
  return `NEXLIFY_VOD:${JSON.stringify(payload)}`;
}

export function VodMovieForm({
  backHref = "/admin/content/movies",
  manageLabel = "Manage Movies",
}: {
  backHref?: string;
  manageLabel?: string;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [bouquetItems, setBouquetItems] = useState<DualListItem[]>([]);
  const [tmdb, setTmdb] = useState<TmdbMetaFields>(emptyTmdbMeta());
  const [useProvider, setUseProvider] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    streamUrl: "",
    categoryId: "",
    notes: "",
    streamIcon: "",
    providerId: "",
    providerPath: "",
  });
  const [meta, setMeta] = useState<VodMeta>({
    location: "remote",
    doNotEncode: false,
    symlinkSource: false,
    directSource: false,
    removeSubtitles: false,
    nativeFrames: false,
    isAdult: false,
    outputFormats: "mp4",
    customMap: "",
    userAgent: "",
    proxy: "",
    headers: [""],
    serverIds: [] as string[],
    transcodeProfile: "none",
    bouquetIds: [] as string[],
  });

  useEffect(() => {
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) =>
        setBouquetItems(
          (d.bouquets ?? []).map((b: { id: string; name: string }) => ({ id: b.id, label: b.name }))
        )
      );
  }, []);

  async function onVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!form.name.trim()) setForm((f) => ({ ...f, name: file.name.replace(/\.[^.]+$/, "") }));
    setUploading(true);
    setUploadNote("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "MOVIE");
    fd.append("name", form.name || file.name);
    const res = await fetch("/api/admin/streams/upload", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setUploadNote(data.error ?? "Upload failed");
      return;
    }
    setUseProvider(false);
    setForm((f) => ({ ...f, streamUrl: data.streamUrl }));
    setMeta((m) => ({ ...m, location: "local" }));
    setUploadNote("File saved under MEDIA_IMPORT_ROOT");
    e.target.value = "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!useProvider && !form.streamUrl.trim()) {
      alert("Source path or URL is required.");
      return;
    }
    if (useProvider && (!form.providerId || !form.providerPath.trim())) {
      alert("Select provider and path.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        type: "MOVIE",
        source: useProvider ? undefined : form.streamUrl,
        hostedExternally: useProvider,
        providerId: useProvider ? form.providerId : null,
        providerPath: useProvider ? form.providerPath : null,
        categoryId: form.categoryId || null,
        streamIcon: form.streamIcon || null,
        playlistUrl: form.notes || null,
        serverId: meta.serverIds[0] || null,
        containerExtension: meta.outputFormats.split(",")[0]?.trim() || "mp4",
        isOnDemand: true,
        vodMode: "MOVIE",
        bouquetIds: meta.bouquetIds,
        agentStartCmd: encodeVodMeta({ ...meta, ...tmdb }),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    router.push(backHref);
  }

  return (
    <form onSubmit={save} className="max-w-5xl">
      <div
        className="flex items-center justify-between px-5 py-3.5 rounded-t-lg"
        style={{
          background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 50%, #2a9fd6 100%)",
        }}
      >
        <h1 className="text-lg font-semibold text-white tracking-wide">Add Movie</h1>
        <Link
          href={backHref}
          className="text-sm px-4 py-1.5 rounded border border-white/80 text-white hover:bg-white/10"
        >
          {manageLabel}
        </Link>
      </div>

      <div
        className="border border-t-0 rounded-b-lg p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <FormField label="Name *" required>
            <input
              required
              className={formInputClass}
              style={formInputStyle}
              placeholder="Movie name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label="Category">
            <select
              className={formSelectClass}
              style={formInputStyle}
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
          </FormField>
          <FormField label="Location">
            <select
              className={formSelectClass}
              style={formInputStyle}
              value={meta.location}
              onChange={(e) => setMeta({ ...meta, location: e.target.value as "remote" | "local" })}
            >
              <option value="remote">Remote</option>
              <option value="local">Local</option>
            </select>
          </FormField>
          <FormField label="Source (path)">
            <div className="flex gap-2">
              <input
                className={`${formInputClass} flex-1 font-mono text-sm`}
                style={formInputStyle}
                placeholder="URL or server path"
                value={form.streamUrl}
                onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
                disabled={useProvider}
              />
              <label className="shrink-0 text-sm px-3 py-2 rounded border cursor-pointer" style={{ borderColor: "var(--border)" }}>
                Pick
                <input type="file" className="hidden" accept="video/*,.mp4,.mkv" onChange={onVideoFile} disabled={uploading} />
              </label>
            </div>
            {uploadNote && (
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {uploadNote}
              </p>
            )}
          </FormField>
        </div>

        <ProviderSourceFields
          providerId={form.providerId}
          providerPath={form.providerPath}
          useProvider={useProvider}
          onChange={({ providerId, providerPath, useProvider: u }) => {
            setUseProvider(u);
            setForm((f) => ({ ...f, providerId, providerPath }));
          }}
        />

        <FormField label="Notes">
          <textarea
            className={formInputClass}
            style={formInputStyle}
            rows={3}
            placeholder="Movie notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormField>

        <div className="grid sm:grid-cols-3 gap-4">
          <YesNo label="Do not encode" value={meta.doNotEncode} onChange={(v) => setMeta({ ...meta, doNotEncode: v })} />
          <YesNo label="Symlink source" value={meta.symlinkSource} onChange={(v) => setMeta({ ...meta, symlinkSource: v })} />
          <YesNo
            label="Direct source (return direct URL)"
            value={meta.directSource}
            onChange={(v) => setMeta({ ...meta, directSource: v })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <YesNo label="Remove subtitles" value={meta.removeSubtitles} onChange={(v) => setMeta({ ...meta, removeSubtitles: v })} />
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setMeta({ ...meta, headers: [...meta.headers, ""] })}
          >
            + Subtitle track
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Stream options">
            <YesNo
              label="Read input source in native frames"
              hint="Use native frame timing for some inputs"
              value={meta.nativeFrames}
              onChange={(v) => setMeta({ ...meta, nativeFrames: v })}
            />
            <YesNo label="Is adult movie" value={meta.isAdult} onChange={(v) => setMeta({ ...meta, isAdult: v })} />
            <FormField label="Output formats *">
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
                          setMeta({
                            ...meta,
                            outputFormats: next.length ? next.join(",") : "mp4",
                          });
                        }}
                      />
                      {fmt}
                    </label>
                  );
                })}
              </div>
            </FormField>
            <FormField label="Custom map">
              <input
                className={formInputClass}
                style={formInputStyle}
                placeholder="Prepend value with dash (-)"
                value={meta.customMap}
                onChange={(e) => setMeta({ ...meta, customMap: e.target.value })}
              />
            </FormField>
          </Section>

          <Section title="Fetching options">
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
                placeholder="Format (ip:port)"
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
                  + 1
                </button>
              </div>
              {meta.headers.map((h, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    className={`${formInputClass} flex-1 font-mono text-xs`}
                    style={formInputStyle}
                    placeholder="cookie:phpsess=1234567890"
                    value={h}
                    onChange={(e) => {
                      const next = [...meta.headers];
                      next[i] = e.target.value;
                      setMeta({ ...meta, headers: next });
                    }}
                  />
                  {meta.headers.length > 1 && (
                    <button
                      type="button"
                      className="text-xs px-2 cursor-pointer"
                      style={{ color: "var(--danger)" }}
                      onClick={() =>
                        setMeta({ ...meta, headers: meta.headers.filter((_, j) => j !== i) })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
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

        <Section title="Bouquets">
          <DualListPicker
            items={bouquetItems}
            selectedIds={meta.bouquetIds}
            onChange={(bouquetIds) => setMeta({ ...meta, bouquetIds })}
            availableTitle="Available bouquets"
            selectedTitle="In movie"
          />
        </Section>

        <Section title="Transcode stream">
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

        <TmdbMetadataSection
          mediaType="movie"
          meta={tmdb}
          onChange={(patch) => setTmdb((m) => ({ ...m, ...patch }))}
          onTitle={(title) =>
            setForm((f) => ({ ...f, name: title }))
          }
          onPoster={(url) => setForm((f) => ({ ...f, streamIcon: url }))}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Link href={backHref} className="btn-cancel rounded px-5 py-2 text-sm font-medium">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || uploading}
            className="btn-positive rounded px-5 py-2 text-sm font-medium cursor-pointer disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add movie"}
          </button>
        </div>
      </div>
    </form>
  );
}
