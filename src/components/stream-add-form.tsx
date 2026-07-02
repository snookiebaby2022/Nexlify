"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { TmdbSearch } from "@/components/tmdb-search";
import { ProviderSourceFields, OnDemandStreamFields } from "@/components/provider-source-fields";
import { ServerTreePicker } from "@/components/server-tree-picker";
import { StreamBouquetSection } from "@/components/stream-bouquet-section";
import {
  StreamAdvancedSections,
  emptyAdvancedState,
  advancedToPayload,
  type StreamAdvancedState,
} from "@/components/stream-advanced-sections";
import {
  FormField,
  formInputClass,
  formInputStyle,
  formSelectClass,
} from "@/components/form-page-shell";
import { StreamProbePlayer } from "@/components/stream-probe-player";

export type StreamAddInitial = {
  name?: string;
  streamUrl?: string;
  backupUrl?: string;
  isRadio?: boolean;
  isCreatedChannel?: boolean;
};

type LiveMeta = {
  redirectStream: boolean;
  isAdult: boolean;
  generateTimestamps: boolean;
  streamAllCodecs: boolean;
  nativeFrames: boolean;
  rtmpOutput: boolean;
  onDemandProbesize: string;
  userAgent: string;
  proxy: string;
  headers: string[];
  epgSourceId: string;
  transcodeProfile: string;
  tvArchiveActive: boolean;
  serverIds: string[];
  bouquetIds: string[];
  autoRestartDays: Record<string, boolean>;
  autoRestartWindow: string;
  customMap: string;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const emptyLiveMeta = (): LiveMeta => ({
  redirectStream: false,
  isAdult: false,
  generateTimestamps: false,
  streamAllCodecs: false,
  nativeFrames: false,
  rtmpOutput: false,
  onDemandProbesize: "512000",
  userAgent: "",
  proxy: "",
  headers: [""],
  epgSourceId: "",
  transcodeProfile: "none",
  tvArchiveActive: false,
  serverIds: [],
  bouquetIds: [],
  autoRestartDays: Object.fromEntries(WEEKDAYS.map((d) => [d, false])) as Record<string, boolean>,
  autoRestartWindow: "",
  customMap: "",
});

function encodeLiveMeta(meta: LiveMeta & { notes?: string }) {
  return `NEXLIFY_LIVE:${JSON.stringify({ v: 1, ...meta })}`;
}

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
      <div className="flex items-center gap-1 mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
        {hint && (
          <span title={hint}>
            <Info size={14} className="opacity-70" />
          </span>
        )}
      </div>
      <div className="flex gap-5">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name={`yn-${label}`} checked={value} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name={`yn-${label}`} checked={!value} onChange={() => onChange(false)} />
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
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-lg border overflow-hidden ${className}`}
      style={{ borderColor: "rgba(0,192,239,0.35)", background: "rgba(0,0,0,0.12)" }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold cursor-pointer"
        style={{ background: "rgba(0,192,239,0.14)", color: "#7dd3fc" }}
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="p-4 space-y-4 border-t" style={{ borderColor: "rgba(0,192,239,0.2)" }}>{children}</div>}
    </div>
  );
}

function LiveStreamForm({
  backHref,
  title,
  manageLabel,
  initial,
}: {
  backHref: string;
  title: string;
  manageLabel: string;
  initial?: StreamAddInitial;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [epgSources, setEpgSources] = useState<{ id: string; name: string }[]>([]);
  const [advanced, setAdvanced] = useState<StreamAdvancedState>(emptyAdvancedState());
  const [parentStreams, setParentStreams] = useState<{ id: string; name: string }[]>([]);
  const [sources, setSources] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [insertMode, setInsertMode] = useState<"single" | "m3u" | "bulk">("single");
  const [bulkText, setBulkText] = useState("");
  const [meta, setMeta] = useState<LiveMeta>(emptyLiveMeta());
  const [form, setForm] = useState({
    name: "",
    streamIcon: "",
    categoryId: "",
    epgChannelId: "",
    notes: "",
    vodMode: "ON_DEMAND" as string,
    archiveDays: "",
    playlistUrl: "",
    isRadio: false,
    isCreatedChannel: false,
    autoRestart: true,
  });

  useEffect(() => {
    if (!initial) return;
    setForm((f) => ({
      ...f,
      name: initial.name?.trim() || f.name,
      isRadio: initial.isRadio ?? f.isRadio,
      isCreatedChannel: initial.isCreatedChannel ?? f.isCreatedChannel,
    }));
    if (initial.streamUrl?.trim()) {
      const urls = [initial.streamUrl.trim()];
      if (initial.backupUrl?.trim()) urls.push(initial.backupUrl.trim());
      setSources(urls);
    }
  }, [initial]);

  useEffect(() => {
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/epg")
      .then((r) => r.json())
      .then((d) => setEpgSources((d.sources ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))));
    fetch("/api/admin/streams?type=LIVE")
      .then((r) => r.json())
      .then((d) => setParentStreams((d.streams ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))));
  }, []);

  function setSource(i: number, value: string) {
    setSources((prev) => prev.map((s, j) => (j === i ? value : s)));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();

    if (insertMode === "m3u") {
      if (!bulkText.trim()) {
        alert("Paste M3U playlist content.");
        return;
      }
      setSaving(true);
      const res = await fetch("/api/admin/import/m3u", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: bulkText,
          streamType: "LIVE",
          categoryId: form.categoryId || null,
          serverId: meta.serverIds[0] || null,
          defaultOnDemand: form.vodMode !== "LIVE",
        }),
      });
      setSaving(false);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Import failed");
        return;
      }
      alert(`Imported ${data.imported} channels (${data.skipped} skipped).`);
      router.push(backHref);
      return;
    }

    if (insertMode === "bulk") {
      const lines = bulkText
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) {
        alert("Add one channel per line (name|url or url only).");
        return;
      }
      setSaving(true);
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const pipe = line.indexOf("|");
        const name =
          pipe > 0 ? line.slice(0, pipe).trim() : `Channel ${i + 1}`;
        const url = (pipe > 0 ? line.slice(pipe + 1) : line).trim();
        if (!url) {
          fail++;
          continue;
        }
        const res = await fetch("/api/admin/streams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            type: "LIVE",
            source: url,
            categoryId: form.categoryId || null,
            serverId: meta.serverIds[0] || null,
            bouquetIds: meta.bouquetIds,
            isOnDemand: form.vodMode !== "LIVE",
            vodMode: form.vodMode,
            isRadio: form.isRadio,
            isCreatedChannel: form.isCreatedChannel,
            autoRestart: form.autoRestart,
          }),
        });
        if (res.ok) ok++;
        else fail++;
      }
      setSaving(false);
      alert(`Added ${ok} channel(s)${fail ? `, ${fail} failed` : ""}.`);
      router.push(backHref);
      return;
    }

    const primary = sources.map((s) => s.trim()).find(Boolean);
    if (!primary) {
      alert("At least one source URL is required.");
      return;
    }
    if (!form.name.trim()) {
      alert("Stream name is required.");
      return;
    }

    const extraSources = sources.map((s) => s.trim()).filter(Boolean).slice(1);

    setSaving(true);
    const res = await fetch("/api/admin/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        type: "LIVE",
        source: primary,
        streamIcon: form.streamIcon || null,
        categoryId: form.categoryId || null,
        epgChannelId: form.epgChannelId || null,
        playlistUrl: form.playlistUrl || form.notes || null,
        serverId: meta.serverIds[0] || null,
        bouquetIds: meta.bouquetIds,
        isOnDemand: form.vodMode !== "LIVE",
        vodMode: form.vodMode,
        archiveDays: form.archiveDays ? Number(form.archiveDays) : null,
        isRadio: form.isRadio,
        isCreatedChannel: form.isCreatedChannel,
        autoRestart: form.autoRestart,
        agentStartCmd: encodeLiveMeta({ ...meta, notes: form.notes }),
        ...advancedToPayload(advanced),
        ...(extraSources[0] ? { backupUrl: extraSources[0] } : {}),
        ...(extraSources.length > 1
          ? {
              bitrates: extraSources.slice(1).map((url, i) => ({
                id: `src-${i + 2}`,
                label: `Source ${i + 3}`,
                path: url,
                isPrimary: false,
              })),
            }
          : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed to create stream");
      return;
    }
    router.push(backHref);
  }

  return (
    <form onSubmit={create} className="max-w-6xl">
      <div
        className="flex items-center justify-between px-5 py-3.5 rounded-t-xl"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 45%, #1a6fa8 100%)" }}
      >
        <h1 className="text-lg font-semibold text-white tracking-wide">{title}</h1>
        <Link
          href={backHref}
          className="text-sm px-4 py-1.5 rounded-md border border-white/70 text-white hover:bg-white/10 transition-colors"
        >
          {manageLabel}
        </Link>
      </div>

      <div
        className="border border-t-0 rounded-b-xl p-5 sm:p-6 space-y-5"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            <FormField label="Insert type">
              <select
                className={formSelectClass}
                style={formInputStyle}
                value={insertMode}
                onChange={(e) => setInsertMode(e.target.value as "single" | "m3u" | "bulk")}
              >
                <option value="single">Insert single</option>
                <option value="m3u">Import M3U playlist</option>
                <option value="bulk">Multiple URLs (one per line)</option>
              </select>
            </FormField>

            {insertMode === "m3u" && (
              <FormField label="M3U playlist" required>
                <textarea
                  required
                  className={formInputClass}
                  style={formInputStyle}
                  rows={8}
                  placeholder="#EXTM3U&#10;#EXTINF:-1,Channel Name&#10;http://..."
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Channels import as on-demand by default (change under On-demand section).
                </p>
              </FormField>
            )}

            {insertMode === "bulk" && (
              <FormField label="Channel list" required>
                <textarea
                  required
                  className={formInputClass}
                  style={formInputStyle}
                  rows={8}
                  placeholder={"BBC One|http://example.com/bbc.m3u8\nhttp://example.com/cnn.m3u8"}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
              </FormField>
            )}

            {insertMode === "single" && (
            <>
            <FormField label="Name" required>
              <input
                required
                className={formInputClass}
                style={formInputStyle}
                placeholder="Stream name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">
                  Source <span style={{ color: "#ef4444" }}>*</span>
                </span>
                <button
                  type="button"
                  className="text-xs px-2.5 py-1 rounded border cursor-pointer"
                  style={{ borderColor: "#00c0ef", color: "#7dd3fc" }}
                  onClick={() => setSources((s) => [...s, ""])}
                >
                  + 1
                </button>
              </div>
              <div className="space-y-2">
                {sources.map((src, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={`${formInputClass} flex-1 font-mono text-sm`}
                      style={formInputStyle}
                      placeholder={i === 0 ? "http://example.com/stream.m3u8" : "Backup source URL"}
                      value={src}
                      onChange={(e) => setSource(i, e.target.value)}
                      required={i === 0}
                    />
                    {sources.length > 1 && (
                      <button
                        type="button"
                        className="text-xs px-3 shrink-0 cursor-pointer rounded border"
                        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                        onClick={() => setSources((s) => s.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {sources[0]?.trim() && (
                <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}>
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                    Check source before saving
                  </p>
                  <StreamProbePlayer compact streamUrl={sources[0].trim()} name={form.name || undefined} />
                </div>
              )}
            </div>
            <FormField label="Icon">
              <input
                className={formInputClass}
                style={formInputStyle}
                placeholder="Stream icon URL"
                value={form.streamIcon}
                onChange={(e) => setForm({ ...form, streamIcon: e.target.value })}
              />
            </FormField>
            </>
            )}
          </div>

          <div className="space-y-4">
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
            <StreamBouquetSection
              selectedIds={meta.bouquetIds}
              onChange={(bouquetIds) => setMeta({ ...meta, bouquetIds })}
              selectedTitle="Assigned"
            />
            <FormField label="Notes">
              <textarea
                className={formInputClass}
                style={formInputStyle}
                rows={4}
                placeholder="Stream notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
          </div>
        </div>

        <Section title="Streaming servers">
          <ServerTreePicker
            selectedIds={meta.serverIds}
            onChange={(serverIds) => setMeta({ ...meta, serverIds })}
          />
        </Section>

        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="RTMP">
            <YesNo
              label="RTMP output"
              value={meta.rtmpOutput}
              onChange={(v) => setMeta({ ...meta, rtmpOutput: v })}
            />
          </Section>
          <Section title="On-demand">
            <OnDemandStreamFields
              vodMode={form.vodMode}
              archiveDays={form.archiveDays}
              playlistUrl={form.playlistUrl}
              onChange={(next) => setForm((f) => ({ ...f, ...next }))}
            />
            <FormField label="Probesize on-demand">
              <input
                className={formInputClass}
                style={formInputStyle}
                value={meta.onDemandProbesize}
                onChange={(e) => setMeta({ ...meta, onDemandProbesize: e.target.value })}
              />
            </FormField>
          </Section>
        </div>

        <Section title="Stream options">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <YesNo
              label="Generate timestamps"
              value={meta.generateTimestamps}
              onChange={(v) => setMeta({ ...meta, generateTimestamps: v })}
            />
            <YesNo
              label="Stream all codecs found on the video"
              value={meta.streamAllCodecs}
              onChange={(v) => setMeta({ ...meta, streamAllCodecs: v })}
            />
            <YesNo
              label="Read input source in native frames"
              hint="Use native frame timing for some inputs"
              value={meta.nativeFrames}
              onChange={(v) => setMeta({ ...meta, nativeFrames: v })}
            />
            <YesNo
              label="Redirect stream"
              value={meta.redirectStream}
              onChange={(v) => setMeta({ ...meta, redirectStream: v })}
            />
            <YesNo label="Is adult stream" value={meta.isAdult} onChange={(v) => setMeta({ ...meta, isAdult: v })} />
          </div>
          <div className="pt-2 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
              Auto restart stream
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              {WEEKDAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={meta.autoRestartDays[day]}
                    onChange={(e) =>
                      setMeta({
                        ...meta,
                        autoRestartDays: { ...meta.autoRestartDays, [day]: e.target.checked },
                      })
                    }
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
            <input
              className={formInputClass}
              style={formInputStyle}
              placeholder="Format: 00:00 - 23:59"
              value={meta.autoRestartWindow}
              onChange={(e) => setMeta({ ...meta, autoRestartWindow: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-6 pt-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRadio}
                onChange={(e) => setForm({ ...form, isRadio: e.target.checked })}
              />
              Radio station
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isCreatedChannel}
                onChange={(e) => setForm({ ...form, isCreatedChannel: e.target.checked })}
              />
              Created channel
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoRestart}
                onChange={(e) => setForm({ ...form, autoRestart: e.target.checked })}
              />
              Agent auto-restart
            </label>
          </div>
        </Section>

        <div className="grid lg:grid-cols-2 gap-4">
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
                <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                  Headers
                </span>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border cursor-pointer"
                  style={{ borderColor: "#00c0ef", color: "#7dd3fc" }}
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
                      onClick={() => setMeta({ ...meta, headers: meta.headers.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title="EPG options">
            <FormField label="Select EPG source">
              <select
                className={formSelectClass}
                style={formInputStyle}
                value={meta.epgSourceId}
                onChange={(e) => setMeta({ ...meta, epgSourceId: e.target.value })}
              >
                <option value="">No EPG</option>
                {epgSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="EPG channel ID">
              <input
                className={formInputClass}
                style={formInputStyle}
                placeholder="Channel ID in EPG source"
                value={form.epgChannelId}
                onChange={(e) => setForm({ ...form, epgChannelId: e.target.value })}
              />
            </FormField>
          </Section>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
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

          <Section title="TV archive">
            <YesNo
              label="Active"
              value={meta.tvArchiveActive}
              onChange={(v) => setMeta({ ...meta, tvArchiveActive: v })}
            />
            <FormField label="Period to keep (days)">
              <input
                type="number"
                min={0}
                className={formInputClass}
                style={formInputStyle}
                placeholder="Period in days"
                value={form.archiveDays}
                onChange={(e) => setForm({ ...form, archiveDays: e.target.value })}
              />
            </FormField>
          </Section>
        </div>

        <Section title="Advanced" defaultOpen={false}>
          <p className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(251,191,36,0.12)", color: "#fcd34d" }}>
            Custom maps and DNS rotator are advanced — only change these if you know what you are doing.
          </p>
          <FormField label="Custom map">
            <input
              className={formInputClass}
              style={formInputStyle}
              placeholder="Prepend value with dash (-)"
              value={meta.customMap}
              onChange={(e) => setMeta({ ...meta, customMap: e.target.value })}
            />
          </FormField>
          <StreamAdvancedSections adv={advanced} setAdv={setAdvanced} parentOptions={parentStreams} />
        </Section>

        <div className="flex justify-end gap-3 pt-2">
          <Link href={backHref} className="btn-cancel rounded-lg px-5 py-2.5 text-sm font-medium">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn-positive rounded-lg px-6 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add stream"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Legacy compact form for movie/series add flows still using this component. */
function CompactStreamForm({
  defaultType,
  backHref,
  title,
  initial,
}: {
  defaultType: "MOVIE" | "SERIES";
  backHref: string;
  title: string;
  initial?: StreamAddInitial;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [bouquetIds, setBouquetIds] = useState<string[]>([]);
  const [useProvider, setUseProvider] = useState(false);
  const [form, setForm] = useState({
    name: "",
    streamUrl: "",
    categoryId: "",
    seriesName: "",
    seasonNum: "1",
    episodeNum: "1",
    providerId: "",
    providerPath: "",
    streamIcon: "",
  });

  useEffect(() => {
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
    if (initial?.name) setForm((f) => ({ ...f, name: initial.name! }));
    if (initial?.streamUrl) setForm((f) => ({ ...f, streamUrl: initial.streamUrl! }));
  }, [initial]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        type: defaultType,
        source: useProvider ? undefined : form.streamUrl,
        hostedExternally: useProvider,
        providerId: useProvider ? form.providerId : null,
        providerPath: useProvider ? form.providerPath : null,
        categoryId: form.categoryId || null,
        seasonNum: Number(form.seasonNum),
        episodeNum: Number(form.episodeNum),
        seriesName: form.seriesName || null,
        streamIcon: form.streamIcon || null,
        bouquetIds,
        isOnDemand: true,
        vodMode: defaultType,
      }),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    router.push(backHref);
  }

  return (
    <form onSubmit={create} className="max-w-2xl space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Link href={backHref} style={{ color: "var(--accent)" }}>
          ← Back
        </Link>
      </div>
      <input
        placeholder="Name"
        required
        className={formInputClass}
        style={formInputStyle}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      {defaultType === "MOVIE" && (
        <TmdbSearch
          mediaType="movie"
          onSelect={(pick) =>
            setForm((f) => ({
              ...f,
              name: pick.title + (pick.year ? ` (${pick.year})` : ""),
              streamIcon: pick.posterUrl ?? f.streamIcon,
            }))
          }
        />
      )}
      <ProviderSourceFields
        providerId={form.providerId}
        providerPath={form.providerPath}
        useProvider={useProvider}
        onChange={({ providerId, providerPath, useProvider: u }) => {
          setUseProvider(u);
          setForm((f) => ({ ...f, providerId, providerPath }));
        }}
      />
      {!useProvider && (
        <>
          <input
            placeholder="Source URL"
            required
            className={formInputClass}
            style={formInputStyle}
            value={form.streamUrl}
            onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
          />
          {form.streamUrl.trim() && (
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                Check source before saving
              </p>
              <StreamProbePlayer compact streamUrl={form.streamUrl.trim()} name={form.name || undefined} />
            </div>
          )}
        </>
      )}
      {defaultType === "SERIES" && (
        <>
          <input
            placeholder="Series name"
            required
            className={formInputClass}
            style={formInputStyle}
            value={form.seriesName}
            onChange={(e) => setForm({ ...form, seriesName: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              placeholder="Season"
              className={formInputClass}
              style={formInputStyle}
              value={form.seasonNum}
              onChange={(e) => setForm({ ...form, seasonNum: e.target.value })}
            />
            <input
              type="number"
              placeholder="Episode"
              className={formInputClass}
              style={formInputStyle}
              value={form.episodeNum}
              onChange={(e) => setForm({ ...form, episodeNum: e.target.value })}
            />
          </div>
        </>
      )}
      <select
        className={formSelectClass}
        style={formInputStyle}
        value={form.categoryId}
        onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
      >
        <option value="">Category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <StreamBouquetSection
        selectedIds={bouquetIds}
        onChange={setBouquetIds}
        selectedTitle={defaultType === "MOVIE" ? "In movie bouquets" : "In series bouquets"}
      />
      <button type="submit" className="btn-positive rounded px-4 py-2 text-sm font-medium">
        Save
      </button>
    </form>
  );
}

export function StreamAddForm({
  defaultType,
  backHref,
  title,
  initial,
}: {
  defaultType: "LIVE" | "MOVIE" | "SERIES";
  backHref: string;
  title: string;
  initial?: StreamAddInitial;
}) {
  const manageLabel =
    defaultType === "LIVE"
      ? backHref.includes("radio")
        ? "Manage radios"
        : "Manage streams"
      : "Back";

  if (defaultType === "LIVE") {
    return (
      <LiveStreamForm
        backHref={backHref}
        title={title}
        manageLabel={manageLabel}
        initial={initial}
      />
    );
  }

  return (
    <CompactStreamForm
      defaultType={defaultType}
      backHref={backHref}
      title={title}
      initial={initial}
    />
  );
}
