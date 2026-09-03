"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hammer, Fingerprint, RotateCcw } from "lucide-react";
import { IpWithFlag } from "@/components/ip-with-flag";
import { subscriptionPaths } from "@/lib/panel-paths";
import { resolveClientPollIntervals, startVisibleInterval } from "@/lib/perf-polling";
import type { PlaybackOutputLabel } from "@/lib/connection-playback-output";
import { connectionQualityClass, type ConnectionQuality } from "@/lib/connection-quality";
import { connectionViewerSessionKey } from "@/lib/connection-address";
import { restartStreamOnServer } from "@/lib/restart-stream";
import { ListPagination } from "@/components/list-pagination";

const ADMIN_POLLS = resolveClientPollIntervals();

type ConnectionRow = {
  id: string;
  lineId: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  streamStartedAt?: string | null;
  lastSeenAt: string;
  serverName: string;
  line: { username: string; maxConnections: number; isRestreamer?: boolean };
  stream: { id: string; name: string; type: string; serverId?: string | null } | null;
  quality: ConnectionQuality;
  output: PlaybackOutputLabel;
};

function connectionRowKey(c: ConnectionRow): string {
  return connectionViewerSessionKey(c.lineId, c.stream?.id ?? null, c.ip);
}

function earlierIso(a?: string | null, b?: string | null): string | null {
  const at = a ? new Date(a).getTime() : NaN;
  const bt = b ? new Date(b).getTime() : NaN;
  if (Number.isFinite(at) && Number.isFinite(bt)) return at <= bt ? (a as string) : (b as string);
  if (Number.isFinite(at)) return a ?? null;
  if (Number.isFinite(bt)) return b ?? null;
  return null;
}

function mergeConnectionRows(prev: ConnectionRow[], incoming: ConnectionRow[]): ConnectionRow[] {
  const prevByKey = new Map(prev.map((row) => [connectionRowKey(row), row]));
  const merged = incoming.map((row) => {
    const old = prevByKey.get(connectionRowKey(row));
    if (!old) return row;
    return {
      ...row,
      startedAt: earlierIso(old.startedAt, row.startedAt) ?? row.startedAt,
      streamStartedAt: earlierIso(old.streamStartedAt, row.streamStartedAt) ?? row.streamStartedAt ?? null,
    };
  });
  return dedupeConnectionRows(merged);
}

function dedupeConnectionRows(rows: ConnectionRow[]): ConnectionRow[] {
  const map = new Map<string, ConnectionRow>();
  for (const c of rows) {
    const key = connectionRowKey(c);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, c);
      continue;
    }
    const cNewer = new Date(c.lastSeenAt).getTime() > new Date(prev.lastSeenAt).getTime();
    const keep = cNewer ? c : prev;
    const other = keep === c ? prev : c;
    map.set(key, {
      ...keep,
      startedAt: earlierIso(keep.startedAt, other.startedAt) ?? keep.startedAt,
      streamStartedAt: earlierIso(keep.streamStartedAt, other.streamStartedAt),
    });
  }
  return [...map.values()];
}

function formatConnDuration(
  startedAt: string | Date | null | undefined,
  nowMs: number
): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "—";
  const sec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function streamWatchStartedAt(c: ConnectionRow): string {
  return c.streamStartedAt || c.startedAt;
}

function durationTitle(c: ConnectionRow, nowMs: number): string {
  return `Stream uptime ${formatConnDuration(streamWatchStartedAt(c), nowMs)} · watching ${formatConnDuration(c.startedAt, nowMs)}`;
}

async function restartConnectionStream(c: ConnectionRow) {
  const streamId = c.stream?.id;
  const serverId = c.stream?.serverId;
  if (!streamId) return;
  if (!serverId) {
    alert("No streaming server assigned to this channel.");
    return;
  }
  if (!confirm(`Restart stream “${c.stream?.name}”? Viewers will reconnect.`)) return;
  const err = await restartStreamOnServer(serverId, streamId);
  if (err) alert(err);
}

function CompactConnectionRow({
  c,
  expanded,
  onToggle,
  onKick,
  paths,
  nowMs,
}: {
  c: ConnectionRow;
  expanded: boolean;
  onToggle: () => void;
  onKick: (id: string) => void;
  paths: ReturnType<typeof subscriptionPaths>;
  nowMs: number;
}) {
  return (
    <div className="panel-mobile-conn-row">
      <button type="button" className="panel-mobile-conn-main" onClick={onToggle}>
        <span className="panel-mobile-conn-status" aria-hidden />
        <span className="panel-mobile-conn-owner">{c.line.username}</span>
        <span className="panel-mobile-conn-chevron" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded ? (
        <div className="panel-mobile-conn-detail">
          <ConnectionCard c={c} paths={paths} onKick={onKick} compact nowMs={nowMs} />
        </div>
      ) : null}
    </div>
  );
}

function ConnectionCard({
  c,
  paths,
  onKick,
  compact = false,
  nowMs,
}: {
  c: ConnectionRow;
  paths: ReturnType<typeof subscriptionPaths>;
  onKick: (id: string) => void;
  compact?: boolean;
  nowMs: number;
}) {
  return (
    <article className={`panel-mobile-card space-y-2 ${compact ? "p-3 border-0" : "p-4"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-base">{c.line.username}</p>
          <p className="text-sm truncate max-w-[240px]" style={{ color: "var(--muted)" }}>
            {c.stream?.name ?? "—"}
          </p>
        </div>
        <span
          className={connectionQualityClass(c.quality.level)}
          title={`Heartbeat freshness ${c.quality.label}. 80–100% is normal for an active viewer.`}
        >
          {c.quality.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 panel-mobile-card-row">
        <div>
          <p className="panel-mobile-card-label">IP</p>
          <p>{c.ip ? <IpWithFlag ip={c.ip} /> : "—"}</p>
        </div>
        <div>
          <p className="panel-mobile-card-label">Duration</p>
          <span className="xui-duration-badge" title={durationTitle(c, nowMs)}>
            {formatConnDuration(streamWatchStartedAt(c), nowMs)}
          </span>
        </div>
        <div>
          <p className="panel-mobile-card-label">Server</p>
          <p className="text-sm">{c.serverName ?? "Main Server"}</p>
        </div>
        <div>
          <p className="panel-mobile-card-label">Output</p>
          <p className="text-sm">{c.output}</p>
        </div>
      </div>
      <div className="panel-mobile-card-actions">
        <button
          type="button"
          className="panel-mobile-card-action panel-mobile-card-action--danger"
          onClick={() => onKick(c.id)}
        >
          <Hammer size={16} />
          Kick
        </button>
        {c.stream?.type === "LIVE" ? (
          <button
            type="button"
            className="panel-mobile-card-action"
            onClick={() => void restartConnectionStream(c)}
          >
            <RotateCcw size={16} />
            Restart
          </button>
        ) : null}
        {c.stream && paths.streamEdit(c.stream.id) ? (
          <Link href={paths.streamEdit(c.stream.id)!} className="panel-mobile-card-action">
            <Fingerprint size={16} />
            Stream
          </Link>
        ) : null}
      </div>
    </article>
  );
}

const LS_AUTO_REFRESH_KEY = "nx-live-conn-auto-refresh";

export function AdminConnectionsClient({
  initialConnections = [],
}: {
  initialConnections?: ConnectionRow[];
}) {
  const pathname = usePathname();
  const paths = subscriptionPaths(pathname);

  const [connections, setConnections] = useState<ConnectionRow[]>(initialConnections);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_AUTO_REFRESH_KEY);
      if (stored === "0") setAutoRefresh(false);
    } catch {}
  }, []);

  function toggleAutoRefresh() {
    setAutoRefresh((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_AUTO_REFRESH_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  function load() {
    fetch("/api/admin/connections", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        const rows = Array.isArray(d.connections) ? (d.connections as ConnectionRow[]) : [];
        setConnections((prev) => mergeConnectionRows(prev, rows));
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    let stopped = false;
    let pollStop: (() => void) | undefined;
    let es: EventSource | null = null;

    const startPoll = () => {
      if (stopped || pollStop) return;
      pollStop = startVisibleInterval(() => load(), ADMIN_POLLS.connectionsMs);
    };

    const connectSse = () => {
      if (stopped) return;
      if (typeof EventSource === "undefined") {
        startPoll();
        return;
      }
      try {
        es?.close();
        es = new EventSource("/api/admin/connections/stream");
      } catch {
        startPoll();
        return;
      }
      es.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data) as { connections?: ConnectionRow[] };
          const rows = Array.isArray(d.connections) ? d.connections : [];
          setConnections((prev) => mergeConnectionRows(prev, rows));
        } catch {
          /* ignore malformed ticks */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        startPoll();
      };
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        es?.close();
        es = null;
        return;
      }
      if (!es && !pollStop) connectSse();
    };

    connectSse();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVis);
      es?.close();
      pollStop?.();
    };
  }, [autoRefresh]);

  useEffect(() => {
    return startVisibleInterval(() => setNowMs(Date.now()), 1_000);
  }, []);

  async function kick(id: string) {
    setConnections((rows) => rows.filter((c) => c.id !== id));
    await fetch(`/api/admin/connections?id=${id}`, { method: "DELETE" });
    load();
  }

  async function kickAll() {
    if (!confirm(paths.isReseller ? "Clear all your active connections?" : "Clear all active connections?")) {
      return;
    }
    await fetch("/api/admin/connections?id=all", { method: "DELETE" });
    load();
  }

  const filtered = connections
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.line.username.toLowerCase().includes(q) ||
        (c.ip ?? "").includes(q) ||
        (c.stream?.name ?? "").toLowerCase().includes(q)
      );
    })
    .sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const shown = filtered.slice(startIdx, startIdx + pageSize);

  return (
    <div className="xui-streams-page space-y-4">
      <div className="xui-streams-topbar">
        <h1 className="xui-streams-title">Live Connections</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/analytics" className="xui-streams-btn xui-streams-btn--ghost">
            Geo map & ISP
          </Link>
          <button
            type="button"
            className="xui-streams-btn xui-streams-btn--ghost"
            onClick={toggleAutoRefresh}
            title={autoRefresh ? "Live updates while this page is open (click to pause)" : "Auto refresh paused (click to enable)"}
          >
            {autoRefresh ? "Auto refresh: On" : "Auto refresh: Off"}
          </button>
          <button type="button" className="xui-streams-btn xui-streams-btn--ghost" onClick={load}>
            Refresh now
          </button>
          <button type="button" className="xui-streams-btn xui-streams-btn--ghost" onClick={kickAll}>
            {paths.isReseller ? "Kick mine" : "Kick all"}
          </button>
        </div>
      </div>
      <p className="text-sm px-1 max-w-4xl" style={{ color: "var(--muted)" }}>
        Quality % reflects heartbeat freshness for active viewers (80–100% is normal). Restart restarts the
        channel on its streaming server — viewers reconnect.
      </p>
      {paths.isReseller ? (
        <p className="text-sm px-1" style={{ color: "var(--muted)" }}>
          Showing your lines only.
        </p>
      ) : null}

      <div className="xui-clients-toolbar">
        <label className="xui-clients-show">
          Show{" "}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>{" "}
          entries
        </label>
        <label className="xui-clients-search-label">
          Search:{" "}
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="xui-clients-search-input"
          />
        </label>
      </div>

      <div className="panel-mobile-conn-list md:hidden">
        <div className="panel-mobile-conn-head">
          <span>Status</span>
          <span>Owner</span>
        </div>
        {shown.map((c) => (
          <CompactConnectionRow
            key={connectionRowKey(c)}
            c={c}
            expanded={expandedId === connectionRowKey(c)}
            onToggle={() => {
              const key = connectionRowKey(c);
              setExpandedId((id) => (id === key ? null : key));
            }}
            onKick={kick}
            paths={paths}
            nowMs={nowMs}
          />
        ))}
        {shown.length === 0 && <p className="xui-streams-empty p-4">No active connections.</p>}
      </div>

      <div className="xui-streams-table-wrap hidden md:block">
        <table className="xui-clients-table xui-clients-table--page">
          <thead>
            <tr>
              <th>Quality</th>
              <th>Line</th>
              <th>Watching</th>
              <th>Server</th>
              <th>IP</th>
              <th title="Uptime of the stream being watched. Viewer watch time is in the tooltip.">Duration</th>
              <th>Output</th>
              <th>Restreamer</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={connectionRowKey(c)}>
                <td>
                  <span
                    className={connectionQualityClass(c.quality.level)}
                    title={`Heartbeat freshness ${c.quality.label}. 80–100% is normal for an active viewer.`}
                  >
                    {c.quality.label}
                  </span>
                </td>
                <td className="font-semibold">{c.line.username}</td>
                <td className="max-w-[220px] truncate" title={c.stream?.name ?? undefined}>
                  {c.stream?.name ?? "—"}
                </td>
                <td>{c.serverName ?? "Main Server"}</td>
                <td>{c.ip ? <IpWithFlag ip={c.ip} /> : "—"}</td>
                <td>
                  <span className="xui-duration-badge" title={durationTitle(c, nowMs)}>
                    {formatConnDuration(streamWatchStartedAt(c), nowMs)}
                  </span>
                </td>
                <td>{c.output}</td>
                <td>
                  <span
                    className={`xui-restreamer-dot ${c.line.isRestreamer ? "xui-restreamer-dot--yes" : ""}`}
                  />
                </td>
                <td>
                  <div className="xui-clients-actions">
                    <button
                      type="button"
                      className="xui-icon-action"
                      title="Kick — ends live session"
                      onClick={() => kick(c.id)}
                    >
                      <Hammer size={14} />
                    </button>
                    {c.stream?.type === "LIVE" ? (
                      <button
                        type="button"
                        className="xui-icon-action"
                        title="Restart stream on the assigned server"
                        onClick={() => void restartConnectionStream(c)}
                      >
                        <RotateCcw size={14} />
                      </button>
                    ) : null}
                    {c.stream && paths.streamEdit(c.stream.id) ? (
                      <Link href={paths.streamEdit(c.stream.id)!} className="xui-icon-action" title="Stream">
                        <Fingerprint size={14} />
                      </Link>
                    ) : (
                      <button type="button" className="xui-icon-action" title="Details" disabled>
                        <Fingerprint size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="xui-streams-empty">No active connections.</p>}
      </div>

      <ListPagination
        page={safePage}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
      />
    </div>
  );
}
