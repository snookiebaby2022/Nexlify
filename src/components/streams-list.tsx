"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ChevronDown,
  Filter,
  Play,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { StreamRowActionsMenu } from "@/components/stream-row-actions-menu";
import { normalizeCategoryName } from "@/lib/category-options";
import { parseLiveStreamMeta } from "@/lib/stream-live-meta";
import {
  streamListUptimeKind,
  streamUptimeDisplayLabel,
} from "@/lib/stream-playback-policy";
import { formatUptime } from "@/lib/stream-live-stats";
import { resolveClientPollIntervals, startVisibleInterval } from "@/lib/perf-polling";

const ADMIN_POLLS = resolveClientPollIntervals();
import { StreamTranscodeQuickActions } from "@/components/stream-transcode-quick-actions";
import { StreamClientsModal } from "@/components/stream-clients-modal";
import { type StreamLiveStat } from "@/lib/stream-live-stats";
import { CategorySelect } from "@/components/category-select";
import { categoryTypeForStream, type CategoryOptionInput } from "@/lib/category-options";
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from "@/lib/list-page-sizes";
import { ListPagination } from "@/components/list-pagination";
import { displayStreamIcon } from "@/lib/plex-artwork";
import { StreamDisplayTitle } from "@/components/stream-display-title";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { TmdbBackfillBanner } from "@/components/tmdb-backfill-banner";
import { DuplicateStreamNamesBanner } from "@/components/duplicate-stream-names-banner";
import { parseVodAgentCmd } from "@/lib/vod-meta";
import { detectTitleLanguage } from "@/lib/title-language";
import { RemoveForeignVodButton } from "@/components/remove-foreign-vod-button";
import {
  ColumnPickerList,
  ToolbarDropdown,
  useStoredColumnVisibility,
} from "@/components/table-toolbar-menus";
import { useResellerGroupFlags } from "@/components/reseller-group-flags-context";
import { usePanelLayout } from "@/lib/use-panel-layout";

const StreamVerifyPanel = dynamic(
  () => import("@/components/stream-verify-panel").then((m) => m.StreamVerifyPanel),
  { ssr: false }
);
const StreamPreviewModal = dynamic(
  () => import("@/components/stream-preview-modal").then((m) => m.StreamPreviewModal),
  { ssr: false }
);
const StreamManageEditPage = dynamic(
  () => import("@/components/stream-manage-edit-page").then((m) => m.StreamManageEditPage),
  { ssr: false }
);

type Stream = {
  id: string;
  name: string;
  streamIcon?: string | null;
  streamUrl: string;
  backupUrl?: string | null;
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
  agentStartCmd?: string | null;
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

const STREAM_COLUMN_DEFAULTS: Record<string, boolean> = {
  id: true,
  icon: true,
  name: true,
  servers: true,
  clients: true,
  uptime: true,
  actions: true,
  player: true,
  epg: true,
  streamInfo: true,
};

function streamPlayBtnClass(stream: Stream, probing?: boolean) {
  if (probing) return "xui-stream-play-btn xui-stream-play-btn--pending";
  if (stream.lastProbeOk === true) return "xui-stream-play-btn xui-stream-play-btn--ok";
  if (stream.lastProbeOk === false) return "xui-stream-play-btn xui-stream-play-btn--fail";
  return "xui-stream-play-btn";
}

function serverLabel(s: Stream) {
  const name = s.server?.name ?? "Main Server";
  const host = s.server?.domain || s.server?.host || "";
  return { name, host };
}

function StreamUptimeBadge({ stream, listType }: { stream: Stream; listType?: string }) {
  if (stream.lastProbeOk === false) {
    return (
      <span
        className="xui-uptime-badge"
        style={{ background: "rgba(239,68,68,0.18)", color: "var(--danger)" }}
        title={stream.lastProbeError || "Last source probe failed"}
      >
        Source down
      </span>
    );
  }
  const kind = streamListUptimeKind(stream, listType);
  const mode = streamUptimeDisplayLabel(kind);
  const uptime = formatUptime(stream.liveStats?.uptimeSeconds ?? null);
  const label = stream.liveStats?.uptimeSeconds != null ? mode + " · " + uptime : mode;
  const cls =
    kind === "DIRECT"
      ? "xui-uptime-badge xui-uptime-badge--direct"
      : kind === "LIVE"
        ? "xui-uptime-badge xui-uptime-badge--ok"
        : "xui-uptime-badge xui-uptime-badge--idle";
  return (
    <span
      className={cls}
      title="Uptime is how long this channel has been pulling. Live = through this panel · On-demand = starts when a viewer tunes in · Direct = Direct source is on"
    >
      {label}
    </span>
  );
}

function StreamInfoCell({ stream, listType }: { stream: Stream; listType?: string }) {
  const st = stream.liveStats;
  const mode = streamUptimeDisplayLabel(streamListUptimeKind(stream, listType));
  const kbps = st?.bitrateKbps ?? stream.maxSpeedKbps ?? stream.minSpeedKbps;
  const lines: string[] = [];
  lines.push("Mode: " + mode);
  const statusLabel =
    stream.lastProbeOk === false
      ? "Source down"
      : stream.lastProbeOk === true && st?.displayStatus === "Source down"
        ? "Source OK"
        : st?.displayStatus;
  if (statusLabel) lines.push("Status: " + statusLabel);
  if (kbps) lines.push("Bitrate: " + Number(kbps).toLocaleString() + " kbps");
  if (st?.uptimeSeconds != null) lines.push("Uptime: " + formatUptime(st.uptimeSeconds));
  if (st && st.viewers > 0) lines.push("Viewers: " + st.viewers);
  if (st?.videoCodec) lines.push("Video: " + st.videoCodec);
  if (st?.audioCodec) lines.push("Audio: " + st.audioCodec);
  if (stream.lastProbeOk === false && stream.lastProbeError) {
    lines.push("Probe: " + stream.lastProbeError);
  }
  if (lines.length <= 1 && !st) {
    return <span className="xui-stream-info-empty">Waiting for this channel's probe / process stats</span>;
  }
  return (
    <div className="xui-stream-info text-xs leading-snug" style={{ color: "var(--text)" }}>
      {lines.map((line) => (
        <div key={line} className="xui-stream-info-line">
          {line}
        </div>
      ))}
    </div>
  );
}

export function StreamsList({
  type,
  title,
  addHref,
  importHref,
  initialBootstrap,
}: {
  type?: "LIVE" | "MOVIE" | "SERIES";
  title: string;
  addHref: string;
  importHref?: string;
  initialBootstrap?: {
    streams: Stream[];
    total: number;
    page: number;
    pageSize: number;
    categories: CategoryOptionInput[];
    servers: { id: string; name: string }[];
    typeTotals: { LIVE?: number; MOVIE?: number; SERIES?: number };
  };
}) {
  const router = useRouter();
  const { isTablet } = usePanelLayout();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit")?.trim() || null;
  const { hideAllUrls } = useResellerGroupFlags();
  const statusFromUrl = searchParams.get("status");
  const sourceIssueFromUrl = searchParams.get("sourceIssue");
  const hasUrlListFilter = Boolean(
    statusFromUrl ||
      sourceIssueFromUrl ||
      searchParams.get("page") ||
      searchParams.get("pageSize") ||
      searchParams.get("categoryId") ||
      searchParams.get("search") ||
      searchParams.get("serverId")
  );
  const [streams, setStreams] = useState<Stream[]>(
    hasUrlListFilter ? [] : (initialBootstrap?.streams ?? [])
  );
  const [servers, setServers] = useState<{ id: string; name: string }[]>(initialBootstrap?.servers ?? []);
  const [categories, setCategories] = useState<CategoryOptionInput[]>(initialBootstrap?.categories ?? []);
  const [total, setTotal] = useState(hasUrlListFilter ? 0 : (initialBootstrap?.total ?? 0));
  const pageParam = Number(searchParams.get("page"));
  const pageFromUrl =
    Number.isFinite(pageParam) && pageParam > 0
      ? Math.floor(pageParam)
      : initialBootstrap?.page ?? 1;
  const pageSizeFromUrl =
    Number(searchParams.get("pageSize")) || initialBootstrap?.pageSize || DEFAULT_LIST_PAGE_SIZE;
  const [page, setPage] = useState(pageFromUrl);
  const [pageSize, setPageSize] = useState<number>(pageSizeFromUrl);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") ?? "");
  const [serverId, setServerId] = useState(searchParams.get("serverId") ?? "");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive" | "online" | "offline">(
    statusFromUrl === "active" ||
      statusFromUrl === "inactive" ||
      statusFromUrl === "online" ||
      statusFromUrl === "offline"
      ? statusFromUrl
      : ""
  );
  const [sourceIssueFilter, setSourceIssueFilter] = useState<"" | "dead" | "unstable">(
    sourceIssueFromUrl === "dead" || sourceIssueFromUrl === "unstable" ? sourceIssueFromUrl : ""
  );
  const modeFromUrl = searchParams.get("vodMode");
  const [modeFilter, setModeFilter] = useState<"" | "LIVE" | "ON_DEMAND" | "CATCHUP">(
    modeFromUrl === "LIVE" || modeFromUrl === "ON_DEMAND" || modeFromUrl === "CATCHUP"
      ? modeFromUrl
      : ""
  );
  const [audioFilter, setAudioFilter] = useState(searchParams.get("audio") ?? "");
  const [videoFilter, setVideoFilter] = useState(searchParams.get("video") ?? "");
  const [qualityFilter, setQualityFilter] = useState(searchParams.get("quality") ?? "");
  const [clientsModal, setClientsModal] = useState<{ id: string; name: string } | null>(null);
  const [previewModal, setPreviewModal] = useState<Stream | null>(null);
  const [probingPage, setProbingPage] = useState(false);
  const [probingIds, setProbingIds] = useState<Set<string>>(() => new Set());
  const probedPageKeyRef = useRef("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const streamCols = useStoredColumnVisibility(
    `nexlify.streams.columns.${type ?? "all"}`,
    STREAM_COLUMN_DEFAULTS
  );
  const streamColumnOptions = [
    { id: "id", label: "ID" },
    { id: "icon", label: "Icon" },
    { id: "name", label: "Name", locked: true },
    { id: "servers", label: "Servers" },
    { id: "clients", label: "Clients" },
    { id: "uptime", label: "Uptime" },
    { id: "actions", label: "Actions", locked: true },
    { id: "player", label: "Player" },
    { id: "epg", label: "EPG" },
    { id: "streamInfo", label: "Stream Info" },
  ];
  const countedKeyRef = useRef("");
  const urlInitRef = useRef(false);
  const liveDefaultCatRef = useRef(Boolean(searchParams.get("categoryId")));

  const listReturnHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (search.trim()) params.set("search", search.trim());
    if (categoryId) params.set("categoryId", categoryId);
    if (serverId) params.set("serverId", serverId);
    if (statusFilter) params.set("status", statusFilter);
    if (sourceIssueFilter) params.set("sourceIssue", sourceIssueFilter);
    if (modeFilter) params.set("vodMode", modeFilter);
    if (audioFilter) params.set("audio", audioFilter);
    if (videoFilter) params.set("video", videoFilter);
    if (qualityFilter) params.set("quality", qualityFilter);
    return `${pathname}?${params.toString()}`;
  }, [
    pathname,
    page,
    pageSize,
    search,
    categoryId,
    serverId,
    statusFilter,
    sourceIssueFilter,
    modeFilter,
    audioFilter,
    videoFilter,
    qualityFilter,
  ]);

  const editHref = (streamId: string, hash = "") =>
    `${listReturnHref}&edit=${encodeURIComponent(streamId)}${hash}`;

  useEffect(() => {
    const href = editId
      ? `${listReturnHref}&edit=${encodeURIComponent(editId)}${window.location.hash}`
      : listReturnHref;
    window.history.replaceState(window.history.state, "", href);
  }, [editId, listReturnHref]);

  const closeEdit = useCallback(() => {
    router.replace(listReturnHref, { scroll: false });
  }, [listReturnHref, router]);

  const openEdit = useCallback(
    (streamId: string, hash = "") => {
      router.replace(`${listReturnHref}&edit=${encodeURIComponent(streamId)}${hash}`, { scroll: false });
    },
    [listReturnHref, router]
  );

  useEffect(() => {
    if (urlInitRef.current || typeof window === "undefined") return;
    urlInitRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    const cat = sp.get("categoryId");
    if (cat) {
      setCategoryId(cat);
      liveDefaultCatRef.current = true;
    }
    const q = sp.get("search");
    if (q) setSearch(q);
  }, []);

  useEffect(() => {
    if (type !== "LIVE" || liveDefaultCatRef.current || categoryId) return;
    const ukEnt = categories.find((c) => {
      const n = normalizeCategoryName(c.name);
      return n === "uk entertainment" || n.endsWith(" uk entertainment");
    });
    if (!ukEnt) return;
    liveDefaultCatRef.current = true;
    setCategoryId(ukEnt.id);
    setPage(1);
  }, [type, categories, categoryId]);

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

  useEffect(() => {
    setSourceIssueFilter(
      sourceIssueFromUrl === "dead" || sourceIssueFromUrl === "unstable"
        ? sourceIssueFromUrl
        : ""
    );
  }, [sourceIssueFromUrl]);

  const [verifyReady, setVerifyReady] = useState(false);
  const [typeTotals, setTypeTotals] = useState<{ LIVE?: number; MOVIE?: number; SERIES?: number }>(
    initialBootstrap?.typeTotals ?? {}
  );
  const skipInitialLoadRef = useRef(
    Boolean(initialBootstrap) && !hasUrlListFilter
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const arm = () => {
      if (!mq.matches) {
        setVerifyReady(false);
        return;
      }
      const idle =
        typeof requestIdleCallback !== "undefined"
          ? requestIdleCallback(() => setVerifyReady(true), { timeout: 800 })
          : window.setTimeout(() => setVerifyReady(true), 200);
      return idle;
    };
    let idle: ReturnType<typeof arm> | undefined = arm();
    const onChange = () => {
      idle = arm();
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      if (idle == null) return;
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
    if (initialBootstrap?.typeTotals) return;
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

  const runPageProbe = useCallback(
    async (list: Stream[], force = false) => {
      if (type !== "LIVE" || !list.length) return;
      const pageKey = `${page}|${list.map((s) => s.id).join(",")}`;
      if (!force && probedPageKeyRef.current === pageKey) return;
      probedPageKeyRef.current = pageKey;

      setProbingPage(true);
      setProbingIds(new Set(list.map((s) => s.id)));
      try {
        const res = await fetch("/api/admin/streams/probe-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            streamIds: list.map((s) => s.id),
            fast: statusFilter !== "offline" && !sourceIssueFilter,
          }),
        });
        const data = (await res.json()) as {
          results?: Record<
            string,
            { lastProbeOk?: boolean; lastProbeError?: string | null; error?: string }
          >;
        };
        if (!res.ok || !data.results) return;
        // #region agent log
        {
          const sample = list.slice(0, 5).map((s) => {
            const row = data.results?.[s.id];
            return {
              id: s.id,
              name: s.name,
              priorOk: s.lastProbeOk,
              priorErr: String(s.lastProbeError ?? "").slice(0, 60),
              resOk: row && !("error" in row) ? row.lastProbeOk : null,
              resErr:
                row && !("error" in row)
                  ? String(row.lastProbeError ?? "").slice(0, 60)
                  : row && "error" in row
                    ? String(row.error).slice(0, 60)
                    : null,
            };
          });
          fetch("http://127.0.0.1:7839/ingest/c301054c-be31-4f2e-af57-bcfeb5a9e0e7", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "8aa94a" },
            body: JSON.stringify({
              sessionId: "8aa94a",
              hypothesisId: "C",
              location: "streams-list.tsx:runPageProbe",
              message: "offline page probe response",
              data: {
                statusFilter,
                fast: statusFilter !== "offline" && !sourceIssueFilter,
                count: list.length,
                sample,
              },
              timestamp: Date.now(),
              runId: "ui-probe",
            }),
          }).catch(() => {});
        }
        // #endregion
        const { notifyStreamHealthChanged } = await import("@/lib/stream-health-events");
        notifyStreamHealthChanged();
        setStreams((prev) => {
          const next = prev.map((s) => {
            const row = data.results?.[s.id];
            if (!row || row.error) return s;
            const ok = row.lastProbeOk ?? s.lastProbeOk;
            const err = row.lastProbeError ?? null;
            const liveStats = s.liveStats
              ? {
                  ...s.liveStats,
                  displayStatus:
                    ok === false
                      ? "Source down"
                      : ok === true && s.liveStats.displayStatus === "Source down"
                        ? "Source OK"
                        : s.liveStats.displayStatus,
                  status:
                    ok === false
                      ? ("offline" as const)
                      : ok === true && s.liveStats.status === "offline"
                        ? ("ready" as const)
                        : s.liveStats.status,
                }
              : s.liveStats;
            return {
              ...s,
              lastProbeOk: ok,
              lastProbeError: err,
              liveStats,
            };
          });
          if (statusFilter === "offline" || sourceIssueFilter) {
            return next.filter((s) => s.lastProbeOk === false);
          }
          return next;
        });
      } finally {
        setProbingPage(false);
        setProbingIds(new Set());
      }
    },
    [type, page, statusFilter, sourceIssueFilter]
  );

  const load = useCallback(
    (opts?: { forceProbe?: boolean }) => {
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
    if (type === "MOVIE" || type === "SERIES") params.set("sort", "newest");
    if (categoryId) params.set("categoryId", categoryId);
    if (serverId) params.set("serverId", serverId);
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (sourceIssueFilter) params.set("sourceIssue", sourceIssueFilter);
    if (type === "LIVE" && modeFilter) params.set("vodMode", modeFilter);
    const loadKey = `${type}|${categoryId}|${serverId}|${search}|${statusFilter}|${sourceIssueFilter}|${modeFilter}`;
    if (countedKeyRef.current === loadKey) {
      params.set("skipTotal", "1");
      params.set("skipEpg", "1");
    }
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const next = (d.streams ?? []) as Stream[];
        setStreams((prev) => {
          if (!params.has("skipEpg")) return next;
          const epgById = new Map(prev.map((s) => [s.id, s.epgWorking]));
          return next.map((s) => ({ ...s, epgWorking: epgById.get(s.id) ?? s.epgWorking }));
        });
        if (typeof d.total === "number") {
          setTotal(d.total);
          countedKeyRef.current = loadKey;
        }
        if (type === "LIVE" && next.length && opts?.forceProbe) {
          void runPageProbe(next, true);
        }
      });
    },
    [type, categoryId, serverId, search, page, pageSize, statusFilter, sourceIssueFilter, modeFilter, runPageProbe]
  );

  useEffect(() => {
    if (initialBootstrap?.categories?.length) return;
    fetch(`/api/admin/categories?lite=1${type ? `&type=${type}` : ""}`)
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    if (initialBootstrap?.servers?.length) return;
    fetch("/api/admin/servers?lite=1")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, [type, initialBootstrap?.categories?.length, initialBootstrap?.servers?.length]);

  useEffect(() => {
    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      if (type === "MOVIE" || type === "SERIES") return;
      return startVisibleInterval(load, ADMIN_POLLS.streamsMs);
    }
    load();
    if (type === "MOVIE" || type === "SERIES") {
      return;
    }
    return startVisibleInterval(load, ADMIN_POLLS.streamsMs);
  }, [load, type, initialBootstrap?.streams]);

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
          {type === "LIVE" ? (
            <Link href="/admin/streams/sources" className="xui-streams-btn xui-streams-btn--ghost">
              Sources
            </Link>
          ) : null}
          {type === "LIVE" ? (
            <button
              type="button"
              className="xui-streams-btn xui-streams-btn--ghost"
              disabled={probingPage}
              title="Probe sources on this page only (not automatic)"
              onClick={() => load({ forceProbe: true })}
            >
              {probingPage ? "Probing…" : "Probe page"}
            </button>
          ) : null}
          {type === "MOVIE" ? (
            <RemoveForeignVodButton kind="MOVIE" onDone={() => load()} />
          ) : null}
          {type === "SERIES" ? (
            <RemoveForeignVodButton kind="SERIES" onDone={() => load()} />
          ) : null}
          <Link href={addHref} className="xui-streams-btn xui-streams-btn--add">
            Add Stream
          </Link>
          <button
            type="button"
            className={`xui-streams-icon-btn xui-streams-icon-btn--filter ${showFilters ? "xui-streams-icon-btn--active" : ""}`}
            title="Filters"
            aria-pressed={showFilters}
            onClick={() => {
              if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
                setMobileFiltersOpen(true);
                return;
              }
              setShowFilters((v) => !v);
            }}
          >
            <Filter size={16} />
          </button>
          <button
            type="button"
            className="xui-streams-icon-btn xui-streams-icon-btn--refresh"
            title="Refresh"
            onClick={() => load()}
          >
            <RefreshCw size={16} />
          </button>
          <ToolbarDropdown
            open={moreOpen}
            onClose={() => setMoreOpen(false)}
            trigger={
              <button
                type="button"
                className={`xui-streams-icon-btn xui-streams-icon-btn--menu ${moreOpen ? "xui-streams-icon-btn--active" : ""}`}
                title="More"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((o) => !o)}
              >
                <ChevronDown size={16} />
              </button>
            }
          >
            <button
              type="button"
              className="xui-toolbar-menu-action"
              onClick={() => {
                setSearch("");
                setCategoryId("");
                setServerId("");
                setStatusFilter("");
                setSourceIssueFilter("");
                setModeFilter("");
                setAudioFilter("");
                setVideoFilter("");
                setQualityFilter("");
                setPage(1);
                setMoreOpen(false);
              }}
            >
              Reset filters
            </button>
            {importHref ? (
              <Link href={importHref} className="xui-toolbar-menu-action" onClick={() => setMoreOpen(false)}>
                Import
              </Link>
            ) : null}
            {type === "LIVE" ? (
              <Link href="/admin/streams/sources" className="xui-toolbar-menu-action" onClick={() => setMoreOpen(false)}>
                Sources
              </Link>
            ) : null}
            <Link href={addHref} className="xui-toolbar-menu-action" onClick={() => setMoreOpen(false)}>
              Add stream
            </Link>
            <ColumnPickerList columns={streamColumnOptions} show={streamCols.show} onToggle={streamCols.toggle} />
          </ToolbarDropdown>
        </div>
      </div>

      {(type === "MOVIE" || type === "SERIES") && <TmdbBackfillBanner />}

      {type === "LIVE" && <DuplicateStreamNamesBanner type="LIVE" />}

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
              setSourceIssueFilter("");
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

      {sourceIssueFilter ? (
        <p className="text-sm rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          {sourceIssueFilter === "dead"
            ? "Showing active live streams whose last source probe failed and have no backup URL. Open a stream to repair its primary source and add an independent backup."
            : "Showing active live streams whose last source probe failed but already have a backup URL. Open a stream to test or replace both sources."}
        </p>
      ) : statusFilter === "offline" ? (
        <p className="text-sm rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          Live streams whose last source probe failed. Use Probe page (full check) to retest — streams
          that come back online drop off this list. Direct and on-demand channels without a running
          ffmpeg process are not listed here unless the probe itself failed.
        </p>
      ) : null}

      <div
        className={`xui-streams-filters xui-streams-filters--desktop ${showFilters ? "" : "xui-streams-filters--hidden"}`}
      >
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
            setSourceIssueFilter("");
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
                        name={parseLiveStreamMeta(s.agentStartCmd).catalogName || s.name}
                        fallbackName={s.name}
                        streamIcon={s.streamIcon}
                        streamUrl={hideAllUrls ? "" : s.streamUrl}
                        onOpen={() => openEdit(s.id)}
                        className="xui-stream-name font-semibold block truncate text-left"
                      />
                      {parseLiveStreamMeta(s.agentStartCmd).nowPlayingTitle ? (
                        <p className="text-xs truncate" style={{ color: "var(--accent)" }}>
                          Now: {parseLiveStreamMeta(s.agentStartCmd).nowPlayingTitle}
                        </p>
                      ) : null}
                      {s.category?.name ? (
                        <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                          {s.category.name}
                        </p>
                      ) : null}
                      {type === "MOVIE" || type === "SERIES" ? (
                        <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                          {detectTitleLanguage(s.name, {
                            categoryName: s.category?.name,
                            meta: parseVodAgentCmd(s.agentStartCmd),
                          }).label}
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
              </div>
              <div className="panel-mobile-card-actions flex items-center gap-2">
                <button
                  type="button"
                  className={streamPlayBtnClass(s, probingIds.has(s.id))}
                  title="Preview and probe"
                  onClick={() => setPreviewModal(s)}
                >
                  <Play size={14} fill="currentColor" />
                </button>
                <StreamRowActionsMenu
                  streamId={s.id}
                  streamType={type}
                  isActive={s.isActive}
                  serverId={s.server?.id}
                  onRefresh={load}
                  onDelete={() => remove(s.id)}
                  onEdit={() => openEdit(s.id)}
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
            Player: cyan = not probed · green = source OK · red = probe failed. EPG: gray = not linked · orange =
            linked · green = linked with active guide data.
          </p>
        ) : null}
        <table className="xui-streams-table">
          <thead>
            <tr>
              {streamCols.show("id") ? <th>ID</th> : null}
              {streamCols.show("icon") ? <th>Icon</th> : null}
              {streamCols.show("name") ? <th>Name</th> : null}
              {streamCols.show("servers") ? <th>Servers</th> : null}
              {streamCols.show("clients") ? <th>Clients</th> : null}
              {streamCols.show("uptime") ? <th title="How playback is served right now">Uptime</th> : null}
              {streamCols.show("actions") ? <th>Actions</th> : null}
              {streamCols.show("player") ? <th>Player</th> : null}
              {streamCols.show("epg") ? <th>EPG</th> : null}
              {streamCols.show("streamInfo") ? <th>Stream Info</th> : null}
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
                  {streamCols.show("id") ? <td className="xui-streams-td-id">{rowId}</td> : null}
                  {streamCols.show("icon") ? (
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
                  ) : null}
                  {streamCols.show("name") ? (
                    <td className="xui-streams-td-name">
                      <StreamDisplayTitle
                        name={parseLiveStreamMeta(s.agentStartCmd).catalogName || s.name}
                        fallbackName={s.name}
                        streamIcon={s.streamIcon}
                        streamUrl={hideAllUrls ? "" : s.streamUrl}
                        onOpen={() => openEdit(s.id)}
                        className="xui-stream-name text-left"
                      />
                      {parseLiveStreamMeta(s.agentStartCmd).nowPlayingTitle ? (
                        <span className="block text-xs mt-0.5" style={{ color: "var(--accent)" }}>
                          Now: {parseLiveStreamMeta(s.agentStartCmd).nowPlayingTitle}
                        </span>
                      ) : null}
                      {s.category?.name && (
                        <span className="xui-stream-category">{s.category.name}</span>
                      )}
                      {type === "MOVIE" || type === "SERIES" ? (
                        <span className="xui-stream-category" title="Detected title language">
                          {detectTitleLanguage(s.name, {
                            categoryName: s.category?.name,
                            meta: parseVodAgentCmd(s.agentStartCmd),
                          }).label}
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                  {streamCols.show("servers") ? (
                    <td className="xui-streams-td-server">
                      <span className="xui-stream-server-name">{serverName}</span>
                      {serverHost && !hideAllUrls && <span className="xui-stream-server-host">{serverHost}</span>}
                      {type === "LIVE" && (
                        <StreamTranscodeQuickActions
                          streamId={s.id}
                          serverId={s.server?.id}
                          playbackStatus={st?.status}
                          onRefresh={load}
                        />
                      )}
                    </td>
                  ) : null}
                  {streamCols.show("clients") ? (
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
                  ) : null}
                  {streamCols.show("uptime") ? (
                    <td>
                      <StreamUptimeBadge stream={s} listType={type} />
                    </td>
                  ) : null}
                  {streamCols.show("actions") ? (
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
                        serverId={s.server?.id}
                        onRefresh={load}
                        onDelete={() => remove(s.id)}
                        onEdit={() => openEdit(s.id)}
                      />
                    </td>
                  ) : null}
                  {streamCols.show("player") ? (
                    <td>
                      <button
                        type="button"
                        className={streamPlayBtnClass(s, probingIds.has(s.id))}
                        title={
                          s.lastProbeOk === false && s.lastProbeError
                            ? s.lastProbeError
                            : probingIds.has(s.id)
                              ? "Probing source…"
                              : "Preview and probe source"
                        }
                        onClick={() => setPreviewModal(s)}
                      >
                        <Play size={14} fill="currentColor" />
                      </button>
                    </td>
                  ) : null}
                  {streamCols.show("epg") ? (
                    <td>
                      <button
                        type="button"
                        onClick={() => openEdit(s.id, "#epg")}
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
                      </button>
                    </td>
                  ) : null}
                  {streamCols.show("streamInfo") ? (
                    <td>
                      <StreamInfoCell stream={s} listType={type} />
                    </td>
                  ) : null}
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

      <ListPagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      {clientsModal && (
        <StreamClientsModal
          streamId={clientsModal.id}
          streamName={clientsModal.name}
          onClose={() => setClientsModal(null)}
        />
      )}

      {previewModal && (
        <StreamPreviewModal
          streamId={previewModal.id}
          streamName={previewModal.name}
          streamUrl={hideAllUrls ? "" : previewModal.streamUrl}
          backupUrl={hideAllUrls ? "" : previewModal.backupUrl}
          streamType={previewModal.type}
          onClose={() => {
            setPreviewModal(null);
            load();
          }}
        />
      )}

      {editId && (
        <div
          className={`xui-modal-backdrop${isTablet ? " xui-modal-backdrop--split" : ""}`}
          onClick={closeEdit}
        >
          <div
            className={`xui-modal-panel xui-line-edit-modal${isTablet ? " xui-line-edit-modal--split" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Edit stream"
            onClick={(event) => event.stopPropagation()}
          >
            <StreamManageEditPage
              key={editId}
              streamId={editId}
              returnTo={listReturnHref}
              onClose={closeEdit}
              onSaved={() => {
                load();
                closeEdit();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
