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
import { CategorySelect } from "@/components/category-select";
import { categoryTypeForStream, type CategoryOptionInput } from "@/lib/category-options";
import { OnDemandStreamFields, ProviderSourceFields } from "@/components/provider-source-fields";

type Stream = {
  id: string;
  name: string;
  streamUrl: string;
  backupUrl?: string | null;
  type: string;
  isRadio?: boolean;
  serverId?: string | null;
  categoryId?: string | null;
  epgChannelId?: string | null;
  isActive?: boolean;
  dnsRotator?: unknown;
  bitrates?: unknown;
  isShifted?: boolean;
  timeshiftSeconds?: number | null;
  parentStreamId?: string | null;
  vodMode?: string;
  isOnDemand?: boolean;
  archiveDays?: number | null;
  playlistUrl?: string | null;
  hostedExternally?: boolean;
  providerId?: string | null;
  providerPath?: string | null;
  seriesName?: string | null;
  seasonNum?: number | null;
  episodeNum?: number | null;
  containerExtension?: string | null;
  isAdult?: boolean;
  autoRestart?: boolean;
  isCreatedChannel?: boolean;
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

function manageHrefForType(type: string) {
  if (type === "MOVIE") return "/admin/content/movies";
  if (type === "SERIES") return "/admin/content/series";
  return "/admin/content/streams";
}

function manageLabelForType(type: string) {
  if (type === "MOVIE") return "Manage movies";
  if (type === "SERIES") return "Manage series";
  return "Manage streams";
}

export function StreamManageEditPage({ streamId }: { streamId: string }) {
  const [stream, setStream] = useState<Stream | null>(null);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<CategoryOptionInput[]>([]);
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
    type: "LIVE",
    vodMode: "LIVE",
    archiveDays: "",
    playlistUrl: "",
    useProvider: false,
    providerId: "",
    providerPath: "",
    seriesName: "",
    seasonNum: "",
    episodeNum: "",
    containerExtension: "mp4",
    isAdult: false,
    isRadio: false,
    autoRestart: true,
    isCreatedChannel: false,
  });
  const [saving, setSaving] = useState(false);
  const [epgBusy, setEpgBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/admin/streams/${streamId}`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.stream as Stream | undefined;
        if (!s) return;
        setStream(s);
        const vodMode =
          s.vodMode === "ON_DEMAND" || s.vodMode === "CATCHUP" || s.vodMode === "LIVE"
            ? s.vodMode
            : s.isOnDemand
              ? "ON_DEMAND"
              : "LIVE";
        setForm({
          name: s.name,
          streamUrl: s.streamUrl,
          backupUrl: s.backupUrl ?? "",
          serverId: s.serverId ?? "",
          categoryId: s.categoryId ?? "",
          epgChannelId: s.epgChannelId ?? "",
          isActive: s.isActive !== false,
          bouquetIds: Array.isArray(d.bouquetIds) ? d.bouquetIds : [],
          type: s.type || "LIVE",
          vodMode,
          archiveDays: s.archiveDays != null ? String(s.archiveDays) : "",
          playlistUrl: s.playlistUrl ?? "",
          useProvider: Boolean(s.hostedExternally && s.providerId),
          providerId: s.providerId ?? "",
          providerPath: s.providerPath ?? "",
          seriesName: s.seriesName ?? "",
          seasonNum: s.seasonNum != null ? String(s.seasonNum) : "",
          episodeNum: s.episodeNum != null ? String(s.episodeNum) : "",
          containerExtension: s.containerExtension || "mp4",
          isAdult: Boolean(s.isAdult),
          isRadio: Boolean(s.isRadio),
          autoRestart: s.autoRestart !== false,
          isCreatedChannel: Boolean(s.isCreatedChannel),
        });
        setAdvanced(advancedFromStream(s));
      });
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/streams?type=LIVE&lite=1&picker=1&pageSize=200")
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
    if (form.useProvider && (!form.providerId || !form.providerPath.trim())) {
      setMessage("Select a provider and path, or switch off hosted provider.");
      return;
    }
    if (!form.useProvider && !form.streamUrl.trim()) {
      setMessage("Source URL is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    const isLiveType = form.type === "LIVE";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch("/api/admin/streams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          id: streamId,
          name: form.name,
          type: form.type,
          source: form.useProvider ? undefined : form.streamUrl,
          hostedExternally: form.useProvider,
          providerId: form.useProvider ? form.providerId : null,
          providerPath: form.useProvider ? form.providerPath : null,
          backupUrl: form.backupUrl.trim() || null,
          serverId: form.serverId || null,
          categoryId: form.categoryId || null,
          epgChannelId: form.epgChannelId || null,
          isActive: form.isActive,
          bouquetIds: form.bouquetIds,
          vodMode: isLiveType ? form.vodMode : "ON_DEMAND",
          isOnDemand: isLiveType ? form.vodMode !== "LIVE" : true,
          archiveDays: form.archiveDays ? Number(form.archiveDays) : null,
          playlistUrl: form.playlistUrl.trim() || null,
          seriesName: form.type === "SERIES" ? form.seriesName || form.name : form.seriesName || null,
          seasonNum: form.seasonNum ? Number(form.seasonNum) : null,
          episodeNum: form.episodeNum ? Number(form.episodeNum) : null,
          containerExtension: form.containerExtension || "mp4",
          isAdult: form.isAdult,
          isRadio: form.type === "LIVE" ? form.isRadio : false,
          autoRestart: form.autoRestart,
          isCreatedChannel: form.type === "LIVE" ? form.isCreatedChannel : false,
          autoEpg: isLiveType && !form.epgChannelId.trim(),
          ...advancedToPayload(advanced),
        }),
      });
      const text = await res.text();
      let data: { error?: string; stream?: Stream; epgAutoAssigned?: { epgChannelId: string; epgChannelName: string } } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text?.slice(0, 200) || `Server error (${res.status})` };
      }
      if (!res.ok) {
        setMessage(data.error ?? `Save failed (${res.status})`);
        return;
      }
      setMessage(
        data.epgAutoAssigned
          ? `Saved. Auto EPG → ${data.epgAutoAssigned.epgChannelName || data.epgAutoAssigned.epgChannelId}`
          : "Saved."
      );
      if (data.stream) {
        setStream((s) => (s ? { ...s, ...data.stream } : (data.stream as Stream)));
        setForm((f) => ({
          ...f,
          streamUrl: data.stream?.streamUrl ?? f.streamUrl,
          epgChannelId: data.stream?.epgChannelId ?? f.epgChannelId,
        }));
      }
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      setMessage(aborted ? "Save timed out — try again." : err instanceof Error ? err.message : "Save failed");
    } finally {
      clearTimeout(timer);
      setSaving(false);
    }
  }

  async function autoAssignEpg() {
    if (form.type !== "LIVE") {
      setMessage("Auto EPG is for live channels.");
      return;
    }
    setEpgBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/epg/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId,
          name: form.name,
          force: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "Auto EPG failed");
        return;
      }
      const id = String(data.match?.epgChannelId ?? "");
      setForm((f) => ({ ...f, epgChannelId: id }));
      setMessage(`Auto EPG matched: ${data.match?.epgChannelName || id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Auto EPG failed");
    } finally {
      setEpgBusy(false);
    }
  }

  if (!stream) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Loading stream…
      </p>
    );
  }

  const typeLabel =
    form.type === "LIVE"
      ? "Live channel"
      : form.type === "MOVIE"
        ? "Movie (VOD)"
        : form.type === "SERIES"
          ? "TV series / episode"
          : form.type;

  return (
    <div className="space-y-5 max-w-6xl">
      <StreamLiveInfo streamId={streamId} />

      <form onSubmit={save}>
        <FormPageShell
          title="Edit stream"
          manageHref={manageHrefForType(form.type)}
          manageLabel={manageLabelForType(form.type)}
        >
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
              subtitle="Content type, display name, and category shown in playlists and bouquets."
            >
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Content type" required>
                  <select
                    className={formSelectClass}
                    style={formInputStyle}
                    value={form.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setForm({
                        ...form,
                        type,
                        vodMode: type === "LIVE" ? form.vodMode : "ON_DEMAND",
                      });
                    }}
                  >
                    <option value="LIVE">Live channel</option>
                    <option value="MOVIE">Movie (VOD)</option>
                    <option value="SERIES">TV series / episode</option>
                  </select>
                </FormField>
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
                  <CategorySelect
                    className={formSelectClass}
                    style={formInputStyle}
                    value={form.categoryId}
                    onChange={(categoryId) => setForm({ ...form, categoryId })}
                    categories={categories}
                    typeFilter={categoryTypeForStream(form.type, form.isRadio)}
                    emptyLabel="— No category —"
                  />
                </FormField>
                {(form.type === "MOVIE" || form.type === "SERIES") && (
                  <FormField label="Container / extension">
                    <input
                      className={formInputClass}
                      style={formInputStyle}
                      value={form.containerExtension}
                      onChange={(e) => setForm({ ...form, containerExtension: e.target.value })}
                      placeholder="mp4"
                    />
                  </FormField>
                )}
              </div>
              {form.type === "SERIES" && (
                <div className="grid md:grid-cols-3 gap-4">
                  <FormField label="Series name">
                    <input
                      className={formInputClass}
                      style={formInputStyle}
                      value={form.seriesName}
                      onChange={(e) => setForm({ ...form, seriesName: e.target.value })}
                      placeholder="Show title"
                    />
                  </FormField>
                  <FormField label="Season">
                    <input
                      type="number"
                      min={1}
                      className={formInputClass}
                      style={formInputStyle}
                      value={form.seasonNum}
                      onChange={(e) => setForm({ ...form, seasonNum: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Episode">
                    <input
                      type="number"
                      min={1}
                      className={formInputClass}
                      style={formInputStyle}
                      value={form.episodeNum}
                      onChange={(e) => setForm({ ...form, episodeNum: e.target.value })}
                    />
                  </FormField>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isAdult}
                    onChange={(e) => setForm({ ...form, isAdult: e.target.checked })}
                  />
                  Adult content
                </label>
                {form.type === "LIVE" && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isRadio}
                        onChange={(e) => setForm({ ...form, isRadio: e.target.checked })}
                      />
                      Radio
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
                      Auto-restart
                    </label>
                  </>
                )}
              </div>
            </EditSection>

            {form.type === "LIVE" && (
              <EditSection
                title="Live vs on-demand"
                subtitle="Live channels restream continuously. On-demand / catch-up uses the source (or playlist URL) only when a viewer plays."
              >
                <OnDemandStreamFields
                  vodMode={form.vodMode}
                  archiveDays={form.archiveDays}
                  playlistUrl={form.playlistUrl}
                  onChange={(next) =>
                    setForm({
                      ...form,
                      vodMode: next.vodMode,
                      archiveDays: next.archiveDays,
                      playlistUrl: next.playlistUrl,
                    })
                  }
                />
              </EditSection>
            )}

            <EditSection
              title="Source URL & server"
              subtitle="Use a direct provider URL, or host via a configured provider so playback uses that provider’s URL."
            >
              <ProviderSourceFields
                providerId={form.providerId}
                providerPath={form.providerPath}
                useProvider={form.useProvider}
                vodOnly={form.type !== "LIVE"}
                onChange={(next) =>
                  setForm({
                    ...form,
                    useProvider: next.useProvider,
                    providerId: next.providerId,
                    providerPath: next.providerPath,
                  })
                }
              />
              {!form.useProvider && (
                <FormField label="Direct source URL (M3U8, TS, MP4, RTMP…)" required>
                  <input
                    className={`${formInputClass} font-mono text-xs`}
                    style={formInputStyle}
                    value={form.streamUrl}
                    onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
                    placeholder="http://provider.example.com/movie/user/pass/123.mp4"
                    required={!form.useProvider}
                  />
                  <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                    Paste the provider’s full URL for direct playback (302 / proxy to upstream).
                  </p>
                </FormField>
              )}
              <FormField label="Backup source URL (failover)">
                <input
                  className={`${formInputClass} font-mono text-xs`}
                  style={formInputStyle}
                  value={form.backupUrl}
                  onChange={(e) => setForm({ ...form, backupUrl: e.target.value })}
                  placeholder="http://backup.example.com/stream.m3u8"
                />
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
              </FormField>
            </EditSection>

            {form.type === "LIVE" && (
              <EditSection
                title="EPG mapping"
                subtitle="Links this stream to electronic programme guide data. Auto EPG matches from your imported provider/XMLTV guide."
                defaultOpen={Boolean(form.epgChannelId)}
              >
                <FormField label="EPG channel ID">
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={`${formInputClass} flex-1 min-w-[12rem]`}
                      style={formInputStyle}
                      value={form.epgChannelId}
                      onChange={(e) => setForm({ ...form, epgChannelId: e.target.value })}
                      placeholder="e.g. bbc1.uk or provider channel id"
                    />
                    <button
                      type="button"
                      disabled={epgBusy || !form.name.trim()}
                      onClick={() => void autoAssignEpg()}
                      className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {epgBusy ? "Matching…" : "Auto EPG"}
                    </button>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                    Auto EPG uses channel names from your EPG sources (Admin → EPG). Sync provider EPG there first.
                  </p>
                </FormField>
              </EditSection>
            )}

            <EditSection
              title="Bouquets"
              subtitle="Packages that include this stream for subscriber lines."
            >
              <StreamBouquetSection
                selectedIds={form.bouquetIds}
                onChange={(bouquetIds) => setForm({ ...form, bouquetIds })}
                selectedTitle={
                  form.type === "MOVIE"
                    ? "In movie bouquets"
                    : form.type === "SERIES"
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
            <Link
              href={manageHrefForType(form.type)}
              className="btn-cancel rounded px-6 py-2.5 text-sm font-medium inline-flex items-center"
            >
              Cancel
            </Link>
            {message && (
              <span
                className="text-sm"
                style={{
                  color: message.startsWith("Saved") ? "var(--success)" : "var(--danger)",
                }}
              >
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
