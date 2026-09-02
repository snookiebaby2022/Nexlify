"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { IpWithFlag } from "@/components/ip-with-flag";
import { RefreshCw, Download, Users, Wifi, Clock, Filter } from "lucide-react";

type Conn = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeenAt: string;
  line: { username: string };
  stream: { name: string; type: string } | null;
};

function LineActivityContent() {
  const pathname = usePathname();
  const isReseller = pathname.startsWith("/reseller");
  const searchParams = useSearchParams();
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);
  const [lineId, setLineId] = useState(searchParams.get("lineId") ?? "");
  const [rows, setRows] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);

  const linesApi = isReseller ? "/api/reseller/lines" : "/api/admin/lines";

  useEffect(() => {
    fetch(linesApi)
      .then((r) => r.json())
      .then((d) => setLines(Array.isArray(d.lines) ? d.lines : []));
  }, [linesApi]);

  const load = useCallback(() => {
    setLoading(true);
    const q = lineId ? `?lineId=${encodeURIComponent(lineId)}` : "";
    fetch(`/api/admin/lines/activity${q}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.connections) ? d.connections : []))
      .finally(() => setLoading(false));
  }, [lineId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  function exportCsv() {
    const q = lineId ? `?lineId=${encodeURIComponent(lineId)}&format=csv` : "?format=csv";
    window.location.href = `/api/admin/lines/activity${q}`;
  }

  const uniqueLines = new Set(rows.map((r) => r.line.username)).size;
  const uniqueStreams = new Set(rows.filter((r) => r.stream).map((r) => r.stream!.name)).size;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 rounded-xl"
        style={{ background: "linear-gradient(135deg, rgba(0,192,239,0.15) 0%, rgba(168,85,247,0.12) 50%, transparent 100%)" }}
      >
        <div>
          <h1 className="text-xl font-bold">Line Activity</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            Real-time connection monitoring · auto-refreshes every 10s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border hover:opacity-80 transition-opacity"
            style={{ borderColor: "var(--border)" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border hover:opacity-80 transition-opacity"
            style={{ borderColor: "var(--border)" }}
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div
          className="rounded-xl border p-4 flex items-center gap-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="p-2 rounded-lg" style={{ background: "rgba(0,192,239,0.12)" }}>
            <Wifi size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>Active Connections</div>
          </div>
        </div>
        <div
          className="rounded-xl border p-4 flex items-center gap-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="p-2 rounded-lg" style={{ background: "rgba(168,85,247,0.12)" }}>
            <Users size={18} style={{ color: "#a855f7" }} />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{uniqueLines}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>Unique Lines</div>
          </div>
        </div>
        <div
          className="rounded-xl border p-4 flex items-center gap-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="p-2 rounded-lg" style={{ background: "rgba(34,197,94,0.12)" }}>
            <Clock size={18} style={{ color: "#22c55e" }} />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{uniqueStreams}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>Unique Streams</div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter size={14} style={{ color: "var(--muted)" }} />
        <select
          className="rounded-lg border px-3 py-2 bg-transparent text-sm max-w-xs"
          style={{ borderColor: "var(--border)" }}
          value={lineId}
          onChange={(e) => setLineId(e.target.value)}
        >
          <option value="">All lines</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.username}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.15)" }}>
              <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Line</th>
              <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Stream</th>
              <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>IP Address</th>
              <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Started</th>
              <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t transition-colors hover:bg-white/[0.02]" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3">
                  <span className="font-medium">{c.line.username}</span>
                </td>
                <td className="px-4 py-3">
                  {c.stream ? (
                    <div>
                      <span className="font-medium">{c.stream.name}</span>
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,192,239,0.12)", color: "var(--accent)" }}>
                        {c.stream.type}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.ip ? <IpWithFlag ip={c.ip} /> : <span style={{ color: "var(--muted)" }}>—</span>}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                  {formatDateTime(c.startedAt)}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                  {formatDateTime(c.lastSeenAt)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center" style={{ color: "var(--muted)" }}>
                  {loading ? "Loading connections…" : "No active connections"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isReseller && (
        <Link href="/admin/management/logs" className="text-sm inline-flex items-center gap-1" style={{ color: "var(--accent)" }}>
          Panel audit logs →
        </Link>
      )}
    </div>
  );
}

export default function LineActivityPage() {
  return (
    <Suspense fallback={<p className="text-sm p-6">Loading…</p>}>
      <LineActivityContent />
    </Suspense>
  );
}
