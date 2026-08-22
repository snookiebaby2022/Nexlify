"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hammer, Fingerprint } from "lucide-react";
import { IpWithFlag } from "@/components/ip-with-flag";
import { subscriptionPaths } from "@/lib/panel-paths";
import {
  connectionQualityClass,
  type ConnectionQuality,
} from "@/lib/connection-quality";
import type { PlaybackOutputLabel } from "@/lib/connection-playback-output";
import { resolveClientPollIntervals } from "@/lib/perf-polling";

const ADMIN_POLLS = resolveClientPollIntervals();

type ConnectionRow = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeenAt: string;
  serverName: string;
  line: { username: string; maxConnections: number; isRestreamer?: boolean };
  stream: { id: string; name: string; type: string } | null;
  quality: ConnectionQuality;
  output: PlaybackOutputLabel;
};

function formatConnDuration(startedAt: string | Date, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
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
          title={`Connection quality ${c.quality.label}`}
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
          <span className="xui-duration-badge">{formatConnDuration(c.startedAt, nowMs)}</span>
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

export default function AdminConnectionsPage() {
  const pathname = usePathname();
  const paths = subscriptionPaths(pathname);

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(50);
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
    fetch("/api/admin/connections", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setConnections(Array.isArray(d.connections) ? d.connections : []))
      .catch(() => setConnections([]));
  }

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const t = setInterval(load, ADMIN_POLLS.connectionsMs);
    return () => clearInterval(t);
  }, [autoRefresh]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
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

  const filtered = connections.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.line.username.toLowerCase().includes(q) ||
      (c.ip ?? "").includes(q) ||
      (c.stream?.name ?? "").toLowerCase().includes(q)
    );
  });

  const shown = filtered.slice(0, pageSize);

  return (
    <div className="xui-streams-page space-y-4">
      <div className="xui-streams-topbar">
        <h1 className="xui-streams-title">Live Connections</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="xui-streams-btn xui-streams-btn--ghost"
            onClick={toggleAutoRefresh}
            title={autoRefresh ? "Auto refresh every 5s (click to pause)" : "Auto refresh paused (click to enable)"}
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
      {paths.isReseller ? (
        <p className="text-sm px-1" style={{ color: "var(--muted)" }}>
          Showing your lines only.
        </p>
      ) : null}

      <div className="xui-clients-toolbar">
        <label className="xui-clients-show">
          Show{" "}
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
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
            onChange={(e) => setSearch(e.target.value)}
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
            key={c.id}
            c={c}
            expanded={expandedId === c.id}
            onToggle={() => setExpandedId((id) => (id === c.id ? null : c.id))}
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
              <th>Duration</th>
              <th>Output</th>
              <th>Restreamer</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td>
                  <span
                    className={connectionQualityClass(c.quality.level)}
                    title={`Connection quality ${c.quality.label}`}
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
                  <span className="xui-duration-badge">{formatConnDuration(c.startedAt, nowMs)}</span>
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

      <div className="xui-streams-footer">
        <span>
          Showing {shown.length ? 1 : 0} to {shown.length} of {filtered.length} entries
        </span>
        <div className="xui-streams-pagination">
          <button type="button" disabled>
            Previous
          </button>
          <span className="xui-streams-page-num">1</span>
          <button type="button" disabled>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
