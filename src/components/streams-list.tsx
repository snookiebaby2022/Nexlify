"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { StreamFeatureBadges } from "@/components/stream-advanced-sections";
import { formatUptime, type StreamLiveStat } from "@/lib/stream-live-stats";

type Stream = {
  id: string;
  name: string;
  streamUrl: string;
  type: string;
  category?: { name: string } | null;
  server?: { id: string; name: string } | null;
  isActive: boolean;
  vodMode?: string;
  hostedExternally?: boolean;
  provider?: { name: string } | null;
  isShifted?: boolean;
  timeshiftSeconds?: number | null;
  dnsRotator?: unknown;
  bitrates?: unknown;
  parentStream?: { name: string } | null;
  liveStats?: StreamLiveStat | null;
};

const PAGE_SIZES = [25, 50, 100, 200] as const;

function statusLabel(stats: StreamLiveStat | null | undefined, isActive: boolean) {
  if (!isActive) return "Off";
  if (!stats) return "—";
  if (stats.status === "online") return "Online";
  if (stats.status === "error") return "Error";
  return "Offline";
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [hostedFilter, setHostedFilter] = useState<"" | "1" | "0">("");

  const load = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      withStats: "1",
    });
    if (type) params.set("type", type);
    if (hostedFilter) params.set("hosted", hostedFilter);
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setStreams(d.streams ?? []);
        setTotal(d.total ?? d.streams?.length ?? 0);
      });
  }, [type, hostedFilter, page, pageSize]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this stream?")) return;
    await fetch(`/api/admin/streams?id=${id}`, { method: "DELETE" });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const editHref = (id: string) =>
    type === "LIVE" || !type
      ? `/admin/servers/streams?edit=${id}`
      : `/admin/servers/streams?edit=${id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <Link
            href="/admin/streams/logs"
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: "var(--border)" }}
          >
            Stream logs
          </Link>
          <label className="flex items-center gap-2 text-sm">
            Show
            <select
              className="panel-select rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)" }}
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
          </label>
          {(type === "MOVIE" || type === "SERIES") && (
            <select
              className="text-sm rounded border px-2 py-1.5 bg-transparent panel-select"
              style={{ borderColor: "var(--border)" }}
              value={hostedFilter}
              onChange={(e) => {
                setHostedFilter(e.target.value as "" | "1" | "0");
                setPage(1);
              }}
            >
              <option value="">All sources</option>
              <option value="1">Provider hosted</option>
              <option value="0">Local only</option>
            </select>
          )}
          {importHref && (
            <Link
              href={importHref}
              className="text-sm px-3 py-2 rounded-md border"
              style={{ borderColor: "var(--border)" }}
            >
              Import M3U
            </Link>
          )}
          <Link
            href={addHref}
            className="text-sm px-3 py-2 rounded-md"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + Add
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
        <span>
          {total} total · page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="rounded border px-2 py-1 cursor-pointer disabled:opacity-40"
          style={{ borderColor: "var(--border)" }}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 cursor-pointer disabled:opacity-40"
          style={{ borderColor: "var(--border)" }}
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      <DataTable
        headers={["Name", "Status", "Uptime", "Viewers", "Server(s)", "Source", ""]}
        rows={streams.map((s) => {
          const st = s.liveStats;
          const serverLine =
            st?.servers?.length
              ? st.servers
                  .map(
                    (sv) =>
                      `${sv.serverName}${sv.viewers > 0 ? ` (${sv.viewers})` : ""}`
                  )
                  .join(", ")
              : s.server?.name ?? "—";
          return [
            <span key={`n-${s.id}`}>
              {s.name}
              {s.hostedExternally && (
                <span
                  className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(94,184,232,0.15)", color: "var(--accent)" }}
                >
                  Provider
                </span>
              )}
              <span className="block mt-1">
                <StreamFeatureBadges stream={s} />
              </span>
            </span>,
            <span
              key={`st-${s.id}`}
              style={{
                color:
                  st?.status === "online"
                    ? "var(--success)"
                    : st?.status === "error"
                      ? "var(--danger)"
                      : "inherit",
              }}
            >
              {statusLabel(st, s.isActive)}
            </span>,
            formatUptime(st?.uptimeSeconds ?? null),
            st?.viewers ?? 0,
            <span key={`srv-${s.id}`} className="text-xs">
              {serverLine}
            </span>,
            <span key={s.id} className="truncate max-w-xs block text-xs" style={{ color: "var(--muted)" }}>
              {s.hostedExternally && s.provider ? `${s.provider.name}: ` : ""}
              {s.streamUrl}
            </span>,
            <span key={`act-${s.id}`} className="flex gap-2">
              <Link href={editHref(s.id)} className="text-xs" style={{ color: "var(--accent)" }}>
                Edit
              </Link>
              <Link href="/admin/streams/logs" className="text-xs" style={{ color: "var(--muted)" }}>
                Logs
              </Link>
              <button
                type="button"
                className="text-xs cursor-pointer"
                style={{ color: "var(--danger)" }}
                onClick={() => remove(s.id)}
              >
                Delete
              </button>
            </span>,
          ];
        })}
      />
    </div>
  );
}
