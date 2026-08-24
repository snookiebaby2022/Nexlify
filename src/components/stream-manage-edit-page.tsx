"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Calendar, FileText, Info, Server, Settings } from "lucide-react";
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
import { SourceChannelFinder } from "@/components/source-channel-finder";
import { emptyTmdbMeta, type TmdbMetaFields } from "@/components/tmdb-metadata-section";
import { readVodTmdbFields } from "@/lib/vod-meta";
import { XuiFormTabs, type XuiFormTab } from "@/components/xui-form-tabs";
import { VodInformationTab } from "@/components/vod-information-tab";
import { integrationSourceLabel, stripIntegrationSourceSuffix } from "@/lib/integration-stream-url";
import { cleanTitleForTmdb } from "@/lib/vod-tmdb-enrich";

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
  streamIcon?: string | null;
  agentStartCmd?: string | null;
};

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

type StreamEditTab = "details" | "meta" | "advanced" | "server";

function streamEditTabs(type: string): XuiFormTab<StreamEditTab>[] {
  const metaLabel = type === "LIVE" ? "EPG" : "Information";
  const MetaIcon = type === "LIVE" ? Calendar : Info;
  return [
    { id: "details", label: "Details", icon: FileText },
    { id: "meta", label: metaLabel, icon: MetaIcon },
    { id: "advanced", label: "Advanced", icon: Settings },
    { id: "server", label: "Server", icon: Server },
  ];
}

function previewLabel(type: string) {
  if (type === "MOVIE") return "View Movie";
  if (type === "SERIES") return "View Series";
  return "View Channel";
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
  const [tmdb, setTmdb] = useState<TmdbMetaFields>(emptyTmdbMeta());
  const [streamIcon, setStreamIcon] = useState("");
  const [iconSearching, setIconSearching] = useState(false);
  const [editTab, setEditTab] = useState<StreamEditTab>("details");

  useEffect(() => {
    fetch(`/api/admin/streams/${streamId}`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.stream as Stream | undefined;
        if (!s) return;
        setStream(s);
        const loadedTmdb = readVodTmdbFields((s as Stream).agentStartCmd);
        setTmdb(loadedTmdb);
        const isMovieOrSeries = s.type === "MOVIE" || s.type === "SERIES";
        setStreamIcon(
          String((s as Stream).streamIcon ?? (isMovieOrSeries ? loadedTmdb.tmdbPoster : "") ?? "")
        );
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
          useProvider: Boolean(s.hostedExternally),
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
    fetch("/api/admin/categories?lite=1")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/streams?type=LIVE&lite=1&picker=1&pageSize=200&skipTotal=1")
      .then((r) => r.json())
      .then((d) =>
        setParentStreams(
          (d.streams ?? d.items ?? [])
            .filter((s: { id: string }) => s.id !== streamId)
            .map((s: { id: string; name?: string; label?: string }) => ({
              id: s.id,
              name: s.name ?? s.label ?? s.id,
            }))
        )
      );
  }, [streamId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.useProvider && !form.streamUrl.trim() && !(form.providerId && form.providerPath.trim())) {
      setMessage("Paste the provider URL, or pick a provider and path.");
      return;
    }
    if (!form.useProvider && !form.streamUrl.trim()) {
      setMessage("Source URL is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    const cleanName = integrationSourceLabel(form.streamUrl)
      ? stripIntegrationSourceSuffix(form.name)
      : form.name.trim();
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
          name: cleanName,
          type: form.type,
          source: form.streamUrl,
          hostedExternally: form.useProvider,
          providerId: form.useProvider ? form.providerId || null : null,
          providerPath: form.useProvider ? form.providerPath || null : null,
          backupUrl: form.backupUrl.trim() || null,
          serverId: form.serverId || null,
          categoryId: form.categoryId.trim() || stream?.categoryId || null,
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
          ...(form.type === "MOVIE" || form.type === "SERIES"
            ? {
                vodTmdb: tmdb,
                streamIcon: streamIcon.trim() || tmdb.tmdbPoster.trim() || null,
              }
            : {}),
          ...(form.type === "LIVE" && streamIcon.trim() ? { streamIcon: streamIcon.trim() } : {}),
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

  const isVod = form.type === "MOVIE" || form.type === "SERIES";
  const integrationSource = integrationSourceLabel(form.streamUrl);
  const vodRawTitle =
    form.type === "SERIES" ? form.seriesName.trim() || form.name.trim() : form.name.trim();
  const vodSearchTitle = cleanTitleForTmdb(stripIntegrationSourceSuffix(vodRawTitle));

  const saveBar = (
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
  );

  const detailsFields = (
    <>
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
          <div className="flex gap-2 items-center w-full">
            <input
              className={`${formInputClass} flex-1`}
              style={formInputStyle}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. BBC One HD"
              required
            />
            {integrationSource ? (
              <span
                className="shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--border)", color: "var(--muted)" }}
                title="Imported from integration — not part of the display title"
              >
                {integrationSource}
              </span>
            ) : null}
          </div>
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
      {form.type === "LIVE" && (
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
      )}
      <ProviderSourceFields
        providerId={form.providerId}
        providerPath={form.providerPath}
        useProvider={form.useProvider}
        vodOnly={form.type !== "LIVE"}
        streamType={form.type === "SERIES" ? "SERIES" : form.type === "MOVIE" ? "MOVIE" : "LIVE"}
        onChange={(next) =>
          setForm({
            ...form,
            useProvider: next.useProvider,
            providerId: next.providerId,
            providerPath: next.providerPath,
          })
        }
      />
      <SourceChannelFinder
        streamType={form.type === "SERIES" ? "SERIES" : form.type === "MOVIE" ? "MOVIE" : "LIVE"}
        label="Find source URL from another channel"
        hint="Search by channel name — shows matching streams on this panel. Use URL copies the direct source into the field below."
        showDirectUrl
        onPickProvider={(m) =>
          setForm({
            ...form,
            useProvider: true,
            providerId: m.providerId,
            providerPath: m.providerPath ?? "",
            streamUrl: m.streamUrl || form.streamUrl,
          })
        }
        onPickDirectUrl={(m) =>
          setForm({ ...form, streamUrl: m.streamUrl, useProvider: form.useProvider })
        }
      />
      <FormField label="Direct source URL (M3U8, TS, MP4, RTMP…)" required>
        <input
          className={`${formInputClass} font-mono text-xs`}
          style={formInputStyle}
          value={form.streamUrl}
          onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
          placeholder="http://provider.example.com/movie/user/pass/123.mp4"
          required={!(form.useProvider && form.providerId && form.providerPath.trim())}
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
      </FormField>
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
    </>
  );

  return (
    <div className="space-y-5 max-w-6xl">
      <StreamLiveInfo streamId={streamId} />

      <form onSubmit={save}>
        <FormPageShell
          title={
            form.name.trim() ||
            (form.type === "MOVIE" ? "Movie" : form.type === "SERIES" ? "Series" : "Edit stream")
          }
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
            <a
              href="#stream-preview"
              className="ml-auto text-sm px-3 py-1.5 rounded border font-medium"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              {previewLabel(form.type)}
            </a>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>Stream enabled</span>
            </label>
          </div>

          <XuiFormTabs tabs={streamEditTabs(form.type)} active={editTab} onChange={setEditTab} />

          {editTab === "details" && <div className="space-y-4">{detailsFields}</div>}

          {editTab === "meta" && form.type === "LIVE" && (
            <div className="xui-vod-info-form">
              <div className="xui-vod-info-row">
                <div className="xui-vod-info-label">Icon URL</div>
                <div className="xui-vod-info-field">
                  <div className="flex gap-2 w-full">
                    <input
                      className={`${formInputClass} flex-1 font-mono text-xs`}
                      style={formInputStyle}
                      placeholder="Stream icon URL"
                      value={streamIcon}
                      onChange={(e) => setStreamIcon(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!form.name.trim() || iconSearching}
                      onClick={async () => {
                        if (!form.name.trim()) return;
                        setIconSearching(true);
                        try {
                          const res = await fetch(
                            `/api/admin/streams/icon-search?name=${encodeURIComponent(form.name.trim())}`
                          );
                          const data = await res.json();
                          if (data.logo) setStreamIcon(data.logo);
                        } finally {
                          setIconSearching(false);
                        }
                      }}
                      className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {iconSearching ? "Searching…" : "Auto-detect"}
                    </button>
                  </div>
                  {streamIcon.trim() ? (
                    <div className="mt-2 flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={streamIcon.trim()}
                        alt=""
                        className="w-10 h-10 rounded object-contain bg-white/10"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span className="text-xs truncate" style={{ color: "var(--muted)" }}>
                        {streamIcon}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="xui-vod-info-row">
                <div className="xui-vod-info-label">EPG channel ID</div>
                <div className="xui-vod-info-field">
                  <div className="flex flex-wrap gap-2 w-full">
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
                      className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {epgBusy ? "Matching…" : "Auto EPG"}
                    </button>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                    Auto EPG uses channel names from your EPG sources (Admin → EPG). Sync provider EPG
                    there first, or leave blank to auto-assign on save.
                  </p>
                </div>
              </div>
            </div>
          )}

          {editTab === "meta" && isVod && (
            <VodInformationTab
              mediaType={form.type === "MOVIE" ? "movie" : "tv"}
              meta={tmdb}
              onChange={(patch) => setTmdb((m) => ({ ...m, ...patch }))}
              defaultSearchQuery={vodSearchTitle}
              onPoster={(url) => {
                setStreamIcon(url);
                setTmdb((m) => ({ ...m, tmdbPoster: url }));
              }}
            />
          )}

          {editTab === "advanced" && (
            <StreamAdvancedSections
              adv={advanced}
              setAdv={setAdvanced}
              parentOptions={parentStreams}
            />
          )}

          {editTab === "server" && (
            <div className="space-y-4 max-w-xl">
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
                {form.useProvider ? (
                  <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                    Hosted items play through the source URL. Leave empty unless you need local
                    transcode on a specific server.
                  </p>
                ) : null}
              </FormField>
            </div>
          )}

          {saveBar}
        </FormPageShell>
      </form>

      <div
        id="stream-preview"
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "rgba(0,192,239,0.35)", background: "rgba(0,0,0,0.12)" }}
      >
        <div
          className="px-4 py-2.5"
          style={{ background: "rgba(0,192,239,0.14)", color: "#7dd3fc" }}
        >
          <span className="text-sm font-semibold">Preview player</span>
          <span className="block text-[11px] font-normal opacity-80 mt-0.5">
            Test the current source URL before saving changes.
          </span>
        </div>
        <div className="p-4">
          <StreamProbePlayer streamId={streamId} streamUrl={form.streamUrl} name={form.name} />
        </div>
      </div>
    </div>
  );
}
