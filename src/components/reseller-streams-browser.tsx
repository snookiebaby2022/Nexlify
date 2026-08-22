"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type StreamRow = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  category?: { name: string } | null;
};

type Bouquet = { id: string; name: string };

export function ResellerStreamsBrowser({
  title,
  description,
  query,
}: {
  title: string;
  description: string;
  query: string;
}) {
  const [streams, setStreams] = useState<StreamRow[]>([]);
  const [bouquets, setBouquets] = useState<Bouquet[]>([]);
  const [bouquetId, setBouquetId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const bRes = await fetch("/api/reseller/bouquets");
        const bData = await bRes.json().catch(() => ({}));
        const list: Bouquet[] = Array.isArray(bData.bouquets) ? bData.bouquets : [];
        if (!bRes.ok) throw new Error("bouquets");
        if (!cancelled) {
          setBouquets(list);
          if (!list.length) {
            setStreams([]);
            setLoading(false);
            return;
          }
          if (!bouquetId && list[0]) setBouquetId(list[0].id);
        }
      } catch {
        if (!cancelled) setError("Could not load bouquets.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bouquets.length) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams(query);
        q.set("lite", "1");
        q.set("pageSize", "200");
        if (bouquetId) q.set("bouquetId", bouquetId);
        if (search.trim()) q.set("search", search.trim());
        const res = await fetch(`/api/reseller/streams?${q.toString()}`);
        if (!res.ok) throw new Error("streams");
        const d = await res.json();
        if (!cancelled) setStreams(d.streams ?? []);
      } catch {
        if (!cancelled) setError("Could not load streams.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, bouquetId, search, bouquets.length]);

  const grouped = useMemo(() => {
    const map = new Map<string, StreamRow[]>();
    for (const s of streams) {
      const cat = s.category?.name ?? "Uncategorized";
      const list = map.get(cat) ?? [];
      list.push(s);
      map.set(cat, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [streams]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      </div>

      {!bouquets.length && !loading && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          No bouquets assigned. Ask an admin to grant bouquet access (
          <Link href="/reseller/tickets/new" className="underline" style={{ color: "var(--accent)" }}>
            open a ticket
          </Link>
          ).
        </div>
      )}

      {bouquets.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <select
            className="rounded border px-3 py-2 text-sm panel-select bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={bouquetId}
            onChange={(e) => setBouquetId(e.target.value)}
          >
            {bouquets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm bg-transparent min-w-[200px]"
            style={{ borderColor: "var(--border)" }}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-sm self-center" style={{ color: "var(--muted)" }}>
            {streams.length} item(s)
          </span>
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {loading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>}

      {!loading &&
        grouped.map(([cat, rows]) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--accent)" }}>
              {cat} ({rows.length})
            </h2>
            <ul className="rounded-lg border divide-y mb-4" style={{ borderColor: "var(--border)" }}>
              {rows.map((s) => (
                <li key={s.id} className="px-3 py-2 text-sm flex justify-between gap-3">
                  <span>{s.name}</span>
                  <span className="text-xs shrink-0" style={{ color: s.isActive ? "var(--success)" : "var(--muted)" }}>
                    {s.isActive ? "Active" : "Off"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
