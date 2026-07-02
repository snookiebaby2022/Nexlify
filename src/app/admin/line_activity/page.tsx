"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { IpWithFlag } from "@/components/ip-with-flag";

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

  useEffect(() => {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines));
  }, []);

  const load = useCallback(() => {
    const q = lineId ? `?lineId=${encodeURIComponent(lineId)}` : "";
    fetch(`/api/admin/lines/activity${q}`)
      .then((r) => r.json())
      .then((d) => setRows(d.connections ?? []));
  }, [lineId]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    const q = lineId ? `?lineId=${encodeURIComponent(lineId)}&format=csv` : "?format=csv";
    window.location.href = `/api/admin/lines/activity${q}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Line activity</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Watch history from live connections (last 5 minutes active window).
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="text-sm px-3 py-2 rounded-md border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          Export CSV
        </button>
      </div>

      <select
        className="rounded border px-3 py-2 bg-transparent max-w-md"
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

      <DataTable
        headers={["Line", "Stream", "IP", "Started", "Last seen"]}
        rows={rows.map((c) => [
          c.line.username,
          c.stream ? `${c.stream.name} (${c.stream.type})` : "—",
          c.ip ? <IpWithFlag key={`ip-${c.id}`} ip={c.ip} /> : "—",
          formatDateTime(c.startedAt),
          formatDateTime(c.lastSeenAt),
        ])}
      />
      {!isReseller && (
        <Link href="/admin/management/logs" className="text-sm" style={{ color: "var(--accent)" }}>
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
