"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StreamProbePlayer } from "@/components/stream-probe-player";
import { StreamLiveInfo } from "@/components/stream-live-info";
import {
  StreamAdvancedSections,
  advancedFromStream,
  advancedToPayload,
  emptyAdvancedState,
  type StreamAdvancedState,
} from "@/components/stream-advanced-sections";
import {
  FormField,
  FormPageShell,
  formInputClass,
  formInputStyle,
  formSelectClass,
} from "@/components/form-page-shell";
import { StreamBouquetSection } from "@/components/stream-bouquet-section";

type Stream = {
  id: string;
  name: string;
  streamUrl: string;
  backupUrl?: string | null;
  type: string;
  serverId?: string | null;
  categoryId?: string | null;
  epgChannelId?: string | null;
  isActive?: boolean;
  dnsRotator?: unknown;
  bitrates?: unknown;
  isShifted?: boolean;
  timeshiftSeconds?: number | null;
  parentStreamId?: string | null;
};

function EditSection({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: "rgba(0,192,239,0.35)", background: "rgba(0,0,0,0.12)" }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer"
        style={{ background: "rgba(0,192,239,0.14)", color: "#7dd3fc" }}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-[11px] font-normal opacity-80 mt-0.5">{subtitle}</span>
        </span>
        {open ? <ChevronUp size={16} className="shrink-0" /> : <ChevronDown size={16} className="shrink-0" />}
      </button>
      {open && (
        <div className="p-4 space-y-4 border-t" style={{ borderColor: "rgba(0,192,239,0.2)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function StreamManageEditPage({ streamId }: { streamId: string }) {
  const [stream, setStream] = useState<Stream | null>(null);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [parentStreams, setParentStreams] = useState<{ id: string; name: string }[]>([]);
  const [advanced, setAdvanced] = useState<StreamAdvancedState>(emptyAdvancedState());
  const [form, setForm] = useState({
    name: "",
    streamUrl: "",
    backupUrl: "",
    serverId: "",
    categoryId: "",
    epgChannelId: "",
    isActive: true,
    bouquetIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/admin/streams/${streamId}`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.stream as Stream | undefined;
        if (!s) return;
        setStream(s);
        setForm({
          name: s.name,
          streamUrl: s.streamUrl,
          backupUrl: s.backupUrl ?? "",
          serverId: s.serverId ?? "",
          categoryId: s.categoryId ?? "",
          epgChannelId: s.epgChannelId ?? "",
          isActive: s.isActive !== false,
          bouquetIds: Array.isArray(d.bouquetIds) ? d.bouquetIds : [],
        });
        setAdvanced(advancedFromStream(s));
      });
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/streams?type=LIVE&lite=1")
      .then((r) => r.json())
      .then((d) =>
        setParentStreams(
          (d.streams ?? [])
            .filter((s: { id: string }) => s.id !== streamId)
            .map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
        )
      );
  }, [streamId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/streams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: streamId,
        name: form.name,
        source: form.streamUrl,
        backupUrl: form.backupUrl.trim() || null,
        serverId: form.serverId || null,
        categoryId: form.categoryId || null,
        epgChannelId: form.epgChannelId || null,
        isActive: form.isActive,
        bouquetIds: form.bouquetIds,
        ...advancedToPayload(advanced),
      }),
    });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Save failed");
      return;
    }
    setMessage("Saved.");
    setStream((s) => (s ? { ...s, ...form } : s));
  }

  if (!stream) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Loading stream…
      </p>
    );
  }

  const typeLabel =
    stream.type === "LIVE"
      ? "Live channel"
      : stream.type === "MOVIE"
        ? "Movie (VOD)"
        : stream.type === "SERIES"
          ? "TV series"
          : stream.type;

  return (
    <div className="space-y-5 max-w-6xl">
      <StreamLiveInfo streamId={streamId} />

      <form onSubmit={save}>
        <FormPageShell title="Edit stream" manageHref="/admin/content/streams" manageLabel="Manage streams">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span
              className="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded"
              style={{ background: "rgba(0,192,239,0.2)", color: "#7dd3fc" }}
            >
              {typeLabel}
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
              ID: {streamId}
            </span>
            <label className="ml-auto flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>Stream enabled</span>
            </label>
          </div>

          <div className="space-y-4">
            <EditSection
              title="Stream identity"
              subtitle="Display name and category shown in playlists, bouquets, and the EPG."
            >
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Stream name" required>
                  <input
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. BBC One HD"
                    required
                  />
                </FormField>
                <FormField label="Category">
                  <select
                    className={formSelectClass}
                    style={formInputStyle}
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  >
                    <option value="">— No category —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                    Organize under{" "}
                    <Link href="/admin/categories" className="underline" style={{ color: "var(--accent)" }}>
                      Categories
                    </Link>
                    .
                  </p>
                </FormField>
              </div>
            </EditSection>

            <EditSection
              title="Source URL & server"
              subtitle="Upstream feed address and which streaming server transcodes or proxies this channel."
            >
              <FormField label="Source URL (M3U8, TS, RTMP…)" required>
                <input
                  className={`${formInputClass} font-mono text-xs`}
                  style={formInputStyle}
                  value={form.streamUrl}
                  onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
                  placeholder="http://provider.example.com/stream.m3u8"
                  required
                />
              </FormField>
              <FormField label="Backup source URL (failover)">
                <input
                  className={`${formInputClass} font-mono text-xs`}
                  style={formInputStyle}
                  value={form.backupUrl}
                  onChange={(e) => setForm({ ...form, backupUrl: e.target.value })}
                  placeholder="http://backup.example.com/stream.m3u8"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                  Used automatically when the primary source fails health checks.
                </p>
              </FormField>
              <FormField label="Streaming server">
                <select
                  className={formSelectClass}
                  style={formInputStyle}
                  value={form.serverId}
                  onChange={(e) => setForm({ ...form, serverId: e.target.value })}
                >
                  <option value="">Default / load-balanced</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                  Leave default to let intelligent LB pick the best node for viewers.
                </p>
              </FormField>
            </EditSection>

            <EditSection
              title="EPG mapping"
              subtitle="Links this stream to electronic programme guide data for catch-up and TV guides."
              defaultOpen={Boolean(form.epgChannelId)}
            >
              <FormField label="EPG channel ID">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.epgChannelId}
                  onChange={(e) => setForm({ ...form, epgChannelId: e.target.value })}
                  placeholder="e.g. bbc1.uk or provider channel id"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                  Must match an ID from your EPG source (Admin → EPG → Channel Map).
                </p>
              </FormField>
            </EditSection>

            <EditSection
              title="Bouquets"
              subtitle="Packages that include this stream for subscriber lines."
            >
              <StreamBouquetSection
                selectedIds={form.bouquetIds}
                onChange={(bouquetIds) => setForm({ ...form, bouquetIds })}
                selectedTitle={
                  stream.type === "MOVIE"
                    ? "In movie bouquets"
                    : stream.type === "SERIES"
                      ? "In series bouquets"
                      : "In live bouquets"
                }
              />
            </EditSection>

            <EditSection
              title="Advanced delivery"
              subtitle="Time-shift variants, DNS rotator fallbacks, and multi-bitrate source ladders."
              defaultOpen={false}
            >
              <StreamAdvancedSections
                adv={advanced}
                setAdv={setAdvanced}
                parentOptions={parentStreams}
              />
            </EditSection>
          </div>

          <div className="flex flex-wrap gap-3 items-center pt-5 mt-5 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              type="submit"
              disabled={saving}
              className="btn-positive rounded px-6 py-2.5 font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save stream"}
            </button>
            <Link href="/admin/content/streams" className="btn-cancel rounded px-6 py-2.5 text-sm font-medium inline-flex items-center">
              Cancel
            </Link>
            {message && (
              <span className="text-sm" style={{ color: message === "Saved." ? "var(--success)" : "var(--danger)" }}>
                {message}
              </span>
            )}
          </div>
        </FormPageShell>
      </form>

      <EditSection title="Preview player" subtitle="Test the current source URL before saving changes.">
        <StreamProbePlayer streamId={streamId} streamUrl={form.streamUrl} name={form.name} />
      </EditSection>
    </div>
  );
}
