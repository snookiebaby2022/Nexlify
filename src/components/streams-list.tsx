"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ChevronDown,
  Filter,
  RefreshCw,
  Search,
  Square,
  Volume2,
} from "lucide-react";
import { StreamRowActionsMenu } from "@/components/stream-row-actions-menu";
import { resolveClientPollIntervals } from "@/lib/perf-polling";

const ADMIN_POLLS = resolveClientPollIntervals();
import { StreamTranscodeQuickActions } from "@/components/stream-transcode-quick-actions";
import { StreamClientsModal } from "@/components/stream-clients-modal";
import { type StreamLiveStat } from "@/lib/stream-live-stats";
import { streamUptimeColumnLabel } from "@/lib/stream-playback-policy";
import { CategorySelect } from "@/components/category-select";
import { categoryTypeForStream, type CategoryOptionInput } from "@/lib/category-options";
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from "@/lib/list-page-sizes";
import { displayStreamIcon } from "@/lib/plex-artwork";
import { StreamDisplayTitle } from "@/components/stream-display-title";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { TmdbBackfillBanner } from "@/components/tmdb-backfill-banner";

const StreamVerifyPanel = dynamic(
  () => import("@/components/stream-verify-panel").then((m) => m.StreamVerifyPanel),
  { ssr: false }
);

type Stream = {
  id: string;
  name: string;
  streamIcon?: string | null;
  streamUrl: string;
  type: string;
  sortOrder?: number;
  category?: { id: string; name: string } | null;
  server?: { id: string; name: string; host?: string; domain?: string | null } | null;
  isActive: boolean;
  minSpeedKbps?: number | null;
  maxSpeedKbps?: number | null;
  epgChannelId?: string | null;
  epgWorking?: boolean;
  lastProbeOk?: boolean | null;
  lastProbeError?: string | null;
  liveStats?: StreamLiveStat | null;
  isOnDemand?: boolean;
  vodMode?: string;
  hostedExternally?: boolean;
};

function statusFromSearch(): "" | "active" | "inactive" | "online" | "offline" {
  if (typeof window === "undefined") return "";
  const status = new URLSearchParams(window.location.search).get("status");
  if (status === "active" || status === "inactive" || status === "online" || status === "offline") {
    return status;
  }
  return "";
}

const PAGE_SIZES = LIST_PAGE_SIZE_OPTIONS;

function serverLabel(s: Stream) {
  const name = s.server?.name ?? "Main Server";
  const host = s.server?.domain || s.server?.host || "";
  return { name, host };
}

function streamUptimeKind(s: Stream, listType?: string): "DIRECT" | "LIVE" | "ON-DEMAND" | "CATCHUP" {
  if (s.liveStats?.playbackMode) {
    return streamUptimeColumnLabel(s.liveStats.playbackMode);
  }
  if (s.hostedExternally) return "DIRECT";
  if (s.vodMode === "CATCHUP") return "CATCHUP";
  if (s.isOnDemand || s.vodMode === "ON_DEMAND" || listType === "MOVIE" || listType === "SERIES") {
    return "ON-DEMAND";
  }
  return "LIVE";
}

/** Catalog flag (Live / On demand / Catch-up). Independent of how playback is served. */
function streamCatalogMode(s: Stream, listType?: string): "LIVE" | "ON-DEMAND" | "CATCHUP" {
  if (listType === "MOVIE" || listType === "SERIES") return "ON-DEMAND";
  if (s.vodMode === "CATCHUP") return "CATCHUP";
  if (s.isOnDemand || s.vodMode === "ON_DEMAND") return "ON-DEMAND";
  return "LIVE";
}

function StreamUptimeBadge({ stream, listType }: { stream: Stream; listType?: string }) {
  const kind = streamUptimeKind(stream, listType);
  const cls =
    kind === "DIRECT"
      ? "xui-uptime-badge xui-uptime-badge--direct"
      : kind === "LIVE"
        ? "xui-uptime-badge xui-uptime-badge--ok"
        : "xui-uptime-badge xui-uptime-badge--idle";
  return (
    <span
      className={cls}
      title="How playback is served: LIVE = through this panel, DIRECT = apps hit the provider URL, ON-DEMAND = ffmpeg on tune-in"
    >
      {kind}
    </span>
  );
}

function StreamCatalogModeBadge({ stream, listType }: { stream: Stream; listType?: string }) {
  const kind = streamCatalogMode(stream, listType);
  const cls =
    kind === "LIVE"
      ? "xui-uptime-badge xui-uptime-badge--ok"
      : kind === "CATCHUP"
        ? "xui-uptime-badge xui-uptime-badge--idle"
        : "xui-uptime-badge xui-uptime-badge--ondemand";
  return (
    <span className={cls} title="Catalog mode: Live (always-on) vs On demand vs Catch-up">
      {kind}
    </span>
  );
}

function StreamInfoCell({ stream }: { stream: Stream }) {
  const st = stream.liveStats;
  if (stream.lastProbeOk === false && stream.lastProbeError) {
    return (
      <span className="xui-stream-info-empty" title={stream.lastProbeError}>
        {stream.lastProbeError}
      </span>
    );
  }
  if (!st || st.status === "direct" || st.status === "offline") {
    return (
      <span className="xui-stream-info-empty">No information available</span>
    );
  }
  const kbps = stream.maxSpeedKbps ?? stream.minSpeedKbps;
  const videoCodec = st.videoCodec ?? (st.playbackMode === "transcode" ? "h264" : null);
  const audioCodec = st.audioCodec ?? (st.playbackMode === "transcode" ? "aac" : null);
  return (
    <div className="xui-stream-info">
      {kbps ? <div className="xui-stream-info-line">{kbps.toLocaleString()} Kbps</div> : null}
      <div className="xui-stream-info-icons">
        {videoCodec && <span title={videoCodec}>{videoCodec}</span>}
        {audioCodec && (
          <>
            <Volume2 size={12} aria-hidden />
            <span title={audioCodec}>{audioCodec}</span>
          </>
        )}
        {st.viewers > 0 && <span title={`${st.viewers} viewers`}>{st.viewers}x</span>}
      </div>
    </div>
  );
}

export function StreamsList({
  type,
  title,
  addHref,
  importHref,
}: {
  type?: "LIVE" | "MOVIE" | "SERIES";
  title: string;
  addHref: string;
  importHref?: string;
}) {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("status");
  const [streams, setStreams] = useState<Stream[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<CategoryOptionInput[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_LIST_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serverId, setServerId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive" | "online" | "offline">(
    statusFromUrl === "active" ||
      statusFromUrl === "inactive" ||
      statusFromUrl === "online" ||
      statusFromUrl === "offline"
      ? statusFromUrl
      : ""
  );
  const [modeFilter, setModeFilter] = useState<"" | "LIVE" | "ON_DEMAND" | "CATCHUP">("");
  const [audioFilter, setAudioFilter] = useState("");
  const [videoFilter, setVideoFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [clientsModal, setClientsModal] = useState<{ id: string; name: string } | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const countedKeyRef = useRef("");
  const urlInitRef = useRef(false);

  useEffect(() => {
    if (urlInitRef.current || typeof window === "undefined") return;
    urlInitRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    const cat = sp.get("categoryId");
    if (cat) setCategoryId(cat);
  }, []);

  useEffect(() => {
    if (
      statusFromUrl === "active" ||
      statusFromUrl === "inactive" ||
      statusFromUrl === "online" ||
      statusFromUrl === "offline"
    ) {
      setStatusFilter(statusFromUrl);
      return;
    }
    if (statusFromUrl == null) return;
  }, [statusFromUrl]);

  const [verifyReady, setVerifyReady] = useState(false);
  const [typeTotals, setTypeTotals] = useState<{ LIVE?: number; MOVIE?: number; SERIES?: number }>({});

  useEffect(() => {
    const idle =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(() => setVerifyReady(true), { timeout: 800 })
        : window.setTimeout(() => setVerifyReady(true), 200);
    return () => {
      if (typeof cancelIdleCallback !== "undefined" && typeof idle === "number") {
        try {
          cancelIdleCallback(idle);
        } catch {
          clearTimeout(idle);
        }
      } else {
        clearTimeout(idle);
      }
    };
  }, []);

  useEffect(() => {
    fetch("/api/admin/streams?totals=1")
      .then((r) => r.json())
      .then((d) =>
        setTypeTotals({
          LIVE: d.LIVE ?? 0,
          MOVIE: d.MOVIE ?? 0,
          SERIES: d.SERIES ?? 0,
        })
      )
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    // Movies/series lists don't need live probe stats polling — use lite payload.
    if (type === "MOVIE" || type === "SERIES") {
      params.set("lite", "1");
    } else {
      params.set("withStats", "1");
    }
    if (type) params.set("type", type);
    if (type === "LIVE") params.set("sort", "order");
    if (categoryId) params.set("categoryId", categoryId);
    if (serverId) params.set("serverId", serverId);
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (type === "LIVE" && modeFilter) params.set("vodMode", modeFilter);
    const loadKey = `${type}|${categoryId}|${serverId}|${search}|${statusFilter}|${modeFilter}`;
    if (countedKeyRef.current === loadKey) params.set("skipTotal", "1");
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setStreams(d.streams ?? []);
        if (typeof d.total === "number") {
          setTotal(d.total);
          countedKeyRef.current = loadKey;
        }
      });
  }, [type, categoryId, serverId, search, page, pageSize, statusFilter, modeFilter]);

  useEffect(() => {
    fetch(`/api/admin/categories?lite=1${type ? `&type=${type}` : ""}`)
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/servers?lite=1")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, [type]);

  useEffect(() => {
    load();
    // Live streams refresh often; VOD lists only on filter/page change.
    if (type === "MOVIE" || type === "SERIES") {
      return;
    }
    const t = setInterval(load, ADMIN_POLLS.streamsMs);
    return () => clearInterval(t);
  }, [load, type]);

  const filtered = useMemo(() => {
    return streams.filter((s) => {
      if (audioFilter && s.liveStats?.audioCodec !== audioFilter) return false;
      if (videoFilter && s.liveStats?.videoCodec !== videoFilter) return false;
      if (qualityFilter && s.liveStats?.quality !== qualityFilter) return false;
      return true;
    });
  }, [streams, audioFilter, videoFilter, qualityFilter]);

  async function remove(id: string) {
    if (!confirm("Delete this stream?")) return;
    await fetch(`/api/admin/streams?id=${id}`, { method: "DELETE" });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="xui-streams-page space-y-4">
      <div className="xui-streams-topbar">
        <div>
          <h1 className="xui-streams-title">
            {title === "Manage Streams" || title === "Manage Live Streams" ? "Live Streams" : title}
          </h1>
          {type === "LIVE" ? (
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Live TV only
              {typeTotals.LIVE != null ? ` · ${typeTotals.LIVE.toLocaleString()} live` : ""}
              {typeTotals.MOVIE != null ? ` · ${typeTotals.MOVIE.toLocaleString()} movies (Manage Movies)` : ""}
              {typeTotals.SERIES != null
                ? ` · ${typeTotals.SERIES.toLocaleString()} series (Manage Series)`
                : ""}
              . Movies and TV series are separate pages.
            </p>
          ) : null}
        </div>
        <div className="xui-streams-topbar-actions">
          {importHref && (
            <Link href={importHref} className="xui-streams-btn xui-streams-btn--ghost">
              Import
            </Link>
          )}
          <Link href={addHref} className="xui-streams-btn xui-streams-btn--add">
            Add Stream
          </Link>
          <button type="button" className="xui-streams-icon-btn xui-streams-icon-btn--filter" title="Filters">
            <Filter size={16} />
          </button>
          <button type="button" className="xui-streams-icon-btn xui-streams-icon-btn--refresh" title="Refresh" onClick={load}>
            <RefreshCw size={16} />
          </button>
          <button type="button" className="xui-streams-icon-btn xui-streams-icon-btn--menu" title="More">
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {(type === "MOVIE" || type === "SERIES") && <TmdbBackfillBanner />}

      {type === "LIVE" && !statusFilter && verifyReady && <StreamVerifyPanel />}

      <button
        type="button"
        className="panel-mobile-toolbar-trigger md:hidden"
        onClick={() => setMobileFiltersOpen(true)}
      >
        <Filter size={16} />
        Filters & search
      </button>

      <MobileFilterSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        title="Stream filters"
      >
        <label>
          Search
          <input
            type="search"
            placeholder="Search streams…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="mt-3">
          Server
          <select
            value={serverId}
            onChange={(e) => {
              setServerId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Servers</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3">
          Category
          <CategorySelect
            className="xui-streams-filter-select w-full"
            value={categoryId}
            onChange={(v) => {
              setCategoryId(v);
              setPage(1);
            }}
            categories={categories}
            typeFilter={type ? categoryTypeForStream(type) : null}
            emptyLabel="All Categories"
          />
        </label>
        <label className="mt-3">
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(1);
            }}
          >
            <option value="">No Filter</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="active">Active</option>
            <option value="inactive">Disabled</option>
          </select>
        </label>
        {type === "LIVE" ? (
          <label className="mt-3">
            Mode
            <select
              value={modeFilter}
              onChange={(e) => {
                setModeFilter(e.target.value as typeof modeFilter);
                setPage(1);
              }}
            >
              <option value="">All modes</option>
              <option value="LIVE">Live</option>
              <option value="ON_DEMAND">On demand</option>
              <option value="CATCHUP">Catch-up</option>
            </select>
          </label>
        ) : null}
        <div className="panel-mobile-sheet-actions">
          <button type="button" className="xui-streams-btn xui-streams-btn--add" onClick={() => setMobileFiltersOpen(false)}>
            Apply
          </button>
        </div>
      </MobileFilterSheet>

      {statusFilter === "offline" && (
        <p className="text-sm rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          Live streams whose last source probe failed. Direct and on-demand channels without a running
          ffmpeg process are not listed here unless the probe itself failed.
        </p>
      )}

      <div className="xui-streams-filters xui-streams-filters--desktop">
        <div className="xui-streams-search-wrap">
          <Search size={14} className="xui-streams-search-icon" />
          <input
            type="search"
            placeholder="Search Streams..."
            className="xui-streams-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="xui-streams-filter-select"
          value={serverId}
          onChange={(e) => {
            setServerId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Servers</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <CategorySelect
          className="xui-streams-filter-select"
          value={categoryId}
          onChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
          categories={categories}
          typeFilter={type ? categoryTypeForStream(type) : null}
          emptyLabel="All Categories"
        />
        <select
          className="xui-streams-filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
        >
          <option value="">No Filter</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="active">Active</option>
          <option value="inactive">Disabled</option>
        </select>
        {type === "LIVE" ? (
          <select
            className="xui-streams-filter-select"
            value={modeFilter}
            onChange={(e) => {
              setModeFilter(e.target.value as typeof modeFilter);
              setPage(1);
            }}
            title="Catalog mode: Live vs On demand vs Catch-up"
          >
            <option value="">All modes</option>
            <option value="LIVE">Live</option>
            <option value="ON_DEMAND">On demand</option>
            <option value="CATCHUP">Catch-up</option>
          </select>
        ) : null}
        <select className="xui-streams-filter-select" value={audioFilter} onChange={(e) => { setAudioFilter(e.target.value); setPage(1); }}>
          <option value="">Audio</option>
          {["aac", "mp3", "ac3", "eac3", "opus", "flac", "dts"].map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
        <select className="xui-streams-filter-select" value={videoFilter} onChange={(e) => { setVideoFilter(e.target.value); setPage(1); }}>
          <option value="">Video</option>
          {["h264", "h265", "hevc", "avc", "vp9", "av1", "mpeg2"].map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
        <select className="xui-streams-filter-select" value={qualityFilter} onChange={(e) => { setQualityFilter(e.target.value); setPage(1); }}>
          <option value="">Quality</option>
          {["240p", "360p", "480p", "720p", "1080p", "1080i", "1440p", "2160p", "4k"].map((q) => (
            <option key={q} value={q}>{q.toUpperCase()}</option>
          ))}
        </select>
        <select
          className="xui-streams-filter-select xui-streams-filter-select--narrow"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          title="Show entries"
          aria-label="Show entries"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              Show {n}
            </option>
          ))}
        </select>
      </div>

      <div className="md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {filtered.map((s, i) => {
          const st = s.liveStats;
          const { name: serverName } = serverLabel(s);
          const viewers = st?.viewers ?? 0;
          return (
            <article key={s.id} className="panel-mobile-card p-4 space-y-2">
              <div className="flex gap-3">
                {(() => {
                  const icon = displayStreamIcon(s);
                  return icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={icon}
                      alt=""
                      className="xui-stream-icon shrink-0"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="xui-stream-icon xui-stream-icon--empty shrink-0" />
                  );
                })()}
                <div className="min-w-0 flex-1">
                  <StreamDisplayTitle
                    name={s.name}
                    streamUrl={s.streamUrl}
                    href={`/admin/servers/streams?edit=${s.id}`}
                    className="xui-stream-name font-semibold block truncate"
                  />
                  {s.category?.name ? (
                    <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                      {s.category.name}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="panel-mobile-card-label">Server</p>
                  <p>{serverName}</p>
                </div>
                <div>
                  <p className="panel-mobile-card-label">Clients</p>
                  <button
                    type="button"
                    className={`xui-clients-badge ${viewers > 0 ? "xui-clients-badge--active" : ""}`}
                    onClick={() => setClientsModal({ id: s.id, name: s.name })}
                  >
                    {viewers}
                  </button>
                </div>
                <div>
                  <p className="panel-mobile-card-label">Uptime</p>
                  <StreamUptimeBadge stream={s} listType={type} />
                </div>
                <div>
                  <p className="panel-mobile-card-label">Mode</p>
                  <StreamCatalogModeBadge stream={s} listType={type} />
                </div>
              </div>
              <div className="panel-mobile-card-actions">
                <StreamRowActionsMenu
                  streamId={s.id}
                  streamType={type}
                  isActive={s.isActive}
                  onRefresh={load}
                  onDelete={() => remove(s.id)}
                />
              </div>
            </article>
          );
        })}
        {filtered.length === 0 && (
          <p className="xui-streams-empty p-4">
            {statusFilter === "offline"
              ? "No live streams with a failed source probe."
              : "No streams match your filters."}
          </p>
        )}
      </div>

      <div className="xui-streams-table-wrap hidden md:block">
        {type === "LIVE" ? (
          <p className="text-[10px] px-2 pb-1" style={{ color: "var(--muted)" }}>
            EPG: gray = not linked · orange = linked · green = linked with active guide data.
            Mode is the catalog setting (Live vs On demand); Uptime is how the panel serves playback.
          </p>
        ) : null}
        <table className="xui-streams-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Icon</th>
              <th>Name</th>
              <th>Servers</th>
              <th>Clients</th>
              <th title="How playback is served right now">Uptime</th>
              <th title="Catalog setting: Live vs On demand vs Catch-up">Mode</th>
              <th>Actions</th>
              <th>EPG</th>
              <th>Stream Info</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const st = s.liveStats;
              const { name: serverName, host: serverHost } = serverLabel(s);
              const rowId = (page - 1) * pageSize + i + 1;
              const icon = displayStreamIcon(s);
              const viewers = st?.viewers ?? 0;

              return (
                <tr key={s.id} className={i % 2 === 1 ? "xui-streams-row--alt" : undefined}>
                  <td className="xui-streams-td-id">{rowId}</td>
                  <td className="xui-streams-td-icon">
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={icon}
                        alt=""
                        className="xui-stream-icon"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="xui-stream-icon xui-stream-icon--empty" />
                    )}
                  </td>
                  <td className="xui-streams-td-name">
                    <StreamDisplayTitle
                      name={s.name}
                      streamUrl={s.streamUrl}
                      href={`/admin/servers/streams?edit=${s.id}`}
                      className="xui-stream-name"
                    />
                    {s.category?.name && (
                      <span className="xui-stream-category">{s.category.name}</span>
                    )}
                  </td>
                  <td className="xui-streams-td-server">
                    <span className="xui-stream-server-name">{serverName}</span>
                    {serverHost && <span className="xui-stream-server-host">{serverHost}</span>}
                    {type === "LIVE" && (
                      <StreamTranscodeQuickActions
                        streamId={s.id}
                        serverId={s.server?.id}
                        playbackStatus={st?.status}
                        onRefresh={load}
                      />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`xui-clients-badge ${viewers > 0 ? "xui-clients-badge--active" : ""}`}
                      onClick={() => setClientsModal({ id: s.id, name: s.name })}
                      title="View clients"
                    >
                      {viewers}
                    </button>
                  </td>
                  <td>
                    <StreamUptimeBadge stream={s} listType={type} />
                  </td>
                  <td>
                    <StreamCatalogModeBadge stream={s} listType={type} />
                  </td>
                  <td className="xui-streams-td-actions">
                    {type === "SERIES" ? (
                      <Link
                        href={`/admin/content/episodes?seriesId=${s.id}`}
                        className="text-xs px-1.5 py-1 rounded hover:bg-white/10"
                        title="Edit episodes"
                      >
                        Episodes
                      </Link>
                    ) : null}
                    <StreamRowActionsMenu
                      streamId={s.id}
                      streamType={type}
                      isActive={s.isActive}
                      onRefresh={load}
                      onDelete={() => remove(s.id)}
                    />
                  </td>
                  <td>
                    <Link
                      href={`/admin/servers/streams?edit=${s.id}#epg`}
                      className={`xui-stream-epg-btn ${
                        s.epgChannelId
                          ? s.epgWorking
                            ? "xui-stream-epg-btn--working"
                            : "xui-stream-epg-btn--on"
                          : ""
                      }`}
                      title={
                        !s.epgChannelId
                          ? "No EPG linked — click to map"
                          : s.epgWorking
                            ? "EPG linked with active guide data"
                            : "EPG linked — no current guide data (check XMLTV import)"
                      }
                    >
                      <Square size={12} fill="currentColor" />
                    </Link>
                  </td>
                  <td>
                    <StreamInfoCell stream={s} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="xui-streams-empty">
            {statusFilter === "offline"
              ? "No live streams with a failed source probe."
              : "No streams match your filters."}
          </p>
        )}
      </div>

      <div className="xui-streams-footer">
        <span>
          Showing {from} to {to} of {total} entries
        </span>
        <div className="xui-streams-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹
          </button>
          <span className="xui-streams-page-num">{page}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            ›
          </button>
        </div>
      </div>

      {clientsModal && (
        <StreamClientsModal
          streamId={clientsModal.id}
          streamName={clientsModal.name}
          onClose={() => setClientsModal(null)}
        />
      )}
    </div>
  );
}
