"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type MissingRow = {
  id: string;
  name: string;
  categoryName: string | null;
  epgChannelId: string | null;
};

export default function MissingEpgPage() {
  const [rows, setRows] = useState<MissingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      type: "LIVE",
      missingEpg: "1",
      pageSize: "100",
      page: "1",
    });
    if (q.trim()) params.set("search", q.trim());
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.streams ?? []).map((s: Record<string, unknown>) => ({
          id: String(s.id),
          name: String(s.name ?? ""),
          categoryName:
            s.category && typeof s.category === "object" && s.category && "name" in s.category
              ? String((s.category as { name?: string }).name ?? "")
              : s.categoryName
                ? String(s.categoryName)
                : null,
          epgChannelId: s.epgChannelId ? String(s.epgChannelId) : null,
        }));
        setRows(list.filter((r: MissingRow) => !r.epgChannelId));
        setTotal(typeof d.total === "number" ? d.total : list.length);
      })
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap gap-3 items-start">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Missing EPG</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Live streams with no EPG channel ID. Use Auto-Match to assign, or map manually.
          </p>
        </div>
        <Link href="/admin/epg/auto-match" className="text-sm" style={{ color: "var(--accent)" }}>
          Auto-Match →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search streams…"
          className="rounded border px-3 py-2 text-sm flex-1 min-w-[12rem]"
          style={{ borderColor: "var(--border)" }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          onClick={load}
          className="rounded px-3 py-2 text-sm border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          Refresh
        </button>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {loading ? "Loading…" : `${rows.length} shown · ${total} total without EPG (page cap 100)`}
      </p>

      <ul className="rounded-lg border divide-y" style={{ borderColor: "var(--border)" }}>
        {rows.map((r) => (
          <li key={r.id} className="px-3 py-2.5 flex flex-wrap gap-2 items-center text-sm">
            <span className="font-medium flex-1 min-w-[10rem] truncate">{r.name}</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {r.categoryName || "No category"}
            </span>
            <Link
              href={`/admin/streams/${r.id}/edit`}
              className="text-xs underline"
              style={{ color: "var(--accent)" }}
            >
              Edit
            </Link>
          </li>
        ))}
        {!loading && rows.length === 0 && (
          <li className="px-3 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            All loaded live streams have EPG assigned.
          </li>
        )}
      </ul>
    </div>
  );
}
