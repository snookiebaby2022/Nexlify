"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Filter,
  Layers,
  Play,
  RefreshCw,
  Search,
  Square,
  Volume2,
} from "lucide-react";
import { StreamRowActionsMenu } from "@/components/stream-row-actions-menu";
import { StreamVerifyPanel } from "@/components/stream-verify-panel";
import { StreamClientsModal } from "@/components/stream-clients-modal";
import { StreamPreviewModal } from "@/components/stream-preview-modal";
import { formatUptimeXui, type StreamLiveStat } from "@/lib/stream-live-stats";

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
  liveStats?: StreamLiveStat | null;
};

const PAGE_SIZES = [25, 50, 100, 200] as const;

function serverLabel(s: Stream) {
  const name = s.server?.name ?? "Main Server";
  const host = s.server?.domain || s.server?.host || "";
  return { name, host };
}

function isPlayableStatus(stats: StreamLiveStat | null | undefined) {
  return stats?.status === "online" || stats?.status === "direct" || stats?.status === "ready";
}

function StreamInfoCell({ stream }: { stream: Stream }) {
  const st = stream.liveStats;
  if (!st || st.status === "direct" || st.status === "offline") {
    return (
      <span className="xui-stream-info-empty">No information available</span>
    );
  }
  const kbps = stream.maxSpeedKbps ?? stream.minSpeedKbps;
  return (
    <div className="xui-stream-info">
      {kbps ? <div className="xui-stream-info-line">{kbps.toLocaleString()} Kbps</div> : null}
      <div className="xui-stream-info-icons">
        <span title="h264">h264</span>
        <Volume2 size={12} aria-hidden />
        <span title="aac">aac</span>
        <span title="1x">1x</span>
        <Layers size={12} aria-hidden />
        <span>— FPS</span>
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
  const [streams, setStreams] = useState<Stream[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serverId, setServerId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive" | "online" | "offline">("");
  const [clientsModal, setClientsModal] = useState<{ id: string; name: string } | null>(null);
  const [previewModal, setPreviewModal] = useState<Stream | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      withStats: "1",
    });
    if (type) params.set("type", type);
    if (categoryId) params.set("categoryId", categoryId);
    if (serverId) params.set("serverId", serverId);
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setStreams(d.streams ?? []);
        setTotal(d.total ?? d.streams?.length ?? 0);
      });
  }, [type, categoryId, serverId, search, page, pageSize]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    return streams.filter((s) => {
      if (statusFilter === "active" && !s.isActive) return false;
      if (statusFilter === "inactive" && s.isActive) return false;
      if (statusFilter === "online" && !isPlayableStatus(s.liveStats)) return false;
      if (statusFilter === "offline" && isPlayableStatus(s.liveStats)) return false;
      return true;
    });
  }, [streams, statusFilter]);

  async function remove(id: string) {
    if (!confirm("Delete this stream?")) return;
    await fetch(`/api/admin/streams?id=${id}`, { method: "DELETE" });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="xui-streams-page space-y-0">
      <div className="xui-streams-topbar">
        <h1 className="xui-streams-title">{title === "Manage Streams" ? "Streams" : title}</h1>
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

      {type === "LIVE" && <StreamVerifyPanel />}

      <div className="xui-streams-filters">
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
        <select
          className="xui-streams-filter-select"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="xui-streams-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="">No Filter</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="active">Active</option>
          <option value="inactive">Disabled</option>
        </select>
        <select className="xui-streams-filter-select" defaultValue="">
          <option value="">Audio</option>
        </select>
        <select className="xui-streams-filter-select" defaultValue="">
          <option value="">Video</option>
        </select>
        <select className="xui-streams-filter-select" defaultValue="">
          <option value="">Quality</option>
        </select>
        <select
          className="xui-streams-filter-select xui-streams-filter-select--narrow"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="xui-streams-table-wrap">
        <table className="xui-streams-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Icon</th>
              <th>Name</th>
              <th>Servers</th>
              <th>Clients</th>
              <th>Uptime</th>
              <th>Actions</th>
              <th>Player</th>
              <th>EPG</th>
              <th>Stream Info</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const st = s.liveStats;
              const { name: serverName, host: serverHost } = serverLabel(s);
              const rowId = s.sortOrder && s.sortOrder > 0 ? s.sortOrder : total - ((page - 1) * pageSize + i);
              const isDirect = st?.status === "direct";
              const isOnline = st?.status === "online" && (st.uptimeSeconds ?? 0) > 0;
              const viewers = st?.viewers ?? 0;

              return (
                <tr key={s.id} className={i % 2 === 1 ? "xui-streams-row--alt" : undefined}>
                  <td className="xui-streams-td-id">{rowId}</td>
                  <td className="xui-streams-td-icon">
                    {s.streamIcon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.streamIcon} alt="" className="xui-stream-icon" />
                    ) : (
                      <span className="xui-stream-icon xui-stream-icon--empty" />
                    )}
                  </td>
                  <td className="xui-streams-td-name">
                    <Link href={`/admin/servers/streams?edit=${s.id}`} className="xui-stream-name">
                      {s.name}
                    </Link>
                    {s.category?.name && (
                      <span className="xui-stream-category">{s.category.name}</span>
                    )}
                  </td>
                  <td className="xui-streams-td-server">
                    <span className="xui-stream-server-name">{serverName}</span>
                    {serverHost && <span className="xui-stream-server-host">{serverHost}</span>}
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
                    {isDirect ? (
                      <span className="xui-uptime-badge xui-uptime-badge--direct">DIRECT</span>
                    ) : isOnline || (st?.uptimeSeconds ?? 0) > 0 ? (
                      <span className="xui-uptime-badge xui-uptime-badge--ok">
                        {st?.status === "error" ? (
                          <AlertCircle size={14} className="xui-uptime-icon-warn" />
                        ) : (
                          <CheckCircle2 size={14} className="xui-uptime-icon-ok" />
                        )}
                        {formatUptimeXui(st?.uptimeSeconds ?? null)}
                      </span>
                    ) : (
                      <span className="xui-uptime-badge xui-uptime-badge--idle">—</span>
                    )}
                  </td>
                  <td className="xui-streams-td-actions">
                    <StreamRowActionsMenu
                      streamId={s.id}
                      streamType={type}
                      isActive={s.isActive}
                      onRefresh={load}
                      onDelete={() => remove(s.id)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="xui-stream-play-btn"
                      title="Preview stream"
                      onClick={() => setPreviewModal(s)}
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                  </td>
                  <td>
                    <Link
                      href={`/admin/servers/streams?edit=${s.id}#epg`}
                      className={`xui-stream-epg-btn ${s.epgChannelId ? "xui-stream-epg-btn--on" : ""}`}
                      title={s.epgChannelId ? "EPG linked" : "No EPG"}
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
          <p className="xui-streams-empty">No streams match your filters.</p>
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

      {previewModal && (
        <StreamPreviewModal
          streamId={previewModal.id}
          streamName={previewModal.name}
          streamUrl={previewModal.streamUrl}
          streamType={previewModal.type}
          onClose={() => setPreviewModal(null)}
        />
      )}
    </div>
  );
}
