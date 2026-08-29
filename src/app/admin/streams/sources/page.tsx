"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ListPagination } from "@/components/list-pagination";
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from "@/lib/list-page-sizes";

type SourceRow = {
  origin: string;
  streamCount: number;
  activeCount: number;
  onlineCount: number;
  offlineCount: number;
  types: { LIVE: number; MOVIE: number; SERIES: number };
  sampleNames: string[];
};

export default function StreamSourcesPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (searchDebounced) params.set("search", searchDebounced);
    fetch(`/api/admin/stream-sources?${params}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Failed to load sources (${r.status})`);
        setSources(Array.isArray(d.sources) ? d.sources : []);
        setTotal(Number(d.total ?? 0));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load sources"))
      .finally(() => setLoading(false));
  }, [page, pageSize, searchDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  async function replace(dryRun: boolean) {
    if (!replaceFrom.trim() || !replaceTo.trim()) {
      setMsg("Enter both From and To origins.");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/stream-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: replaceFrom, to: replaceTo, dryRun }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(d.error || "Replace failed");
      return;
    }
    setMsg(
      dryRun
        ? `Preview: ${d.updated} stream URL(s) would change (${d.from} → ${d.to}).`
        : `Updated ${d.updated} stream URL(s) (${d.from} → ${d.to}).`
    );
    if (!dryRun) load();
  }

  return (
    <div className="xui-streams-page space-y-4">
      <div className="xui-streams-topbar">
        <div>
          <h1 className="xui-streams-title">Sources</h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Unique upstream origins used by Manage Streams — same grouping as XUI.one Sources. Replace a host
            across every stream URL that uses it.
          </p>
        </div>
        <Link href="/admin/content/streams" className="xui-streams-btn">
          Manage Streams
        </Link>
      </div>

      <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm font-medium">Replace source</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            From
            <input
              className="xui-lines-select mt-1 w-full"
              placeholder="http://old-provider:8080"
              value={replaceFrom}
              onChange={(e) => setReplaceFrom(e.target.value)}
            />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            To
            <input
              className="xui-lines-select mt-1 w-full"
              placeholder="http://new-provider:8080"
              value={replaceTo}
              onChange={(e) => setReplaceTo(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="xui-streams-btn" disabled={busy} onClick={() => void replace(true)}>
            Preview
          </button>
          <button
            type="button"
            className="xui-streams-btn xui-streams-btn--add"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Replace ${replaceFrom} with ${replaceTo} on matching stream URLs?`)) return;
              void replace(false);
            }}
          >
            Replace
          </button>
        </div>
        {msg ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {msg}
          </p>
        ) : null}
      </div>

      <div className="xui-lines-toolbar flex-wrap">
        <input
          type="search"
          className="xui-lines-select flex-1 min-w-[180px] max-w-md"
          placeholder="Search origin or stream name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <label className="text-xs flex items-center gap-2" style={{ color: "var(--muted)" }}>
          Show
          <select
            className="xui-lines-select"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {LIST_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="xui-streams-btn" onClick={() => load()}>
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="xui-streams-table-wrap overflow-x-auto">
        <table className="xui-streams-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Streams</th>
              <th>Active</th>
              <th>Online</th>
              <th>Offline</th>
              <th>Types</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.origin}>
                <td>
                  <div className="font-mono text-xs break-all">{s.origin}</div>
                  {s.sampleNames.length ? (
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {s.sampleNames.join(" · ")}
                    </div>
                  ) : null}
                </td>
                <td className="tabular-nums">{s.streamCount.toLocaleString()}</td>
                <td className="tabular-nums">{s.activeCount.toLocaleString()}</td>
                <td className="tabular-nums">{s.onlineCount.toLocaleString()}</td>
                <td className="tabular-nums">{s.offlineCount.toLocaleString()}</td>
                <td className="text-xs" style={{ color: "var(--muted)" }}>
                  L {s.types.LIVE} · M {s.types.MOVIE} · S {s.types.SERIES}
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/content/streams?search=${encodeURIComponent(s.origin.replace(/^https?:\/\//, ""))}`}
                      className="xui-streams-btn"
                    >
                      Open streams
                    </Link>
                    <button
                      type="button"
                      className="xui-streams-btn"
                      onClick={() => {
                        setReplaceFrom(s.origin === "(no playable source)" ? "" : s.origin);
                        setReplaceTo("");
                      }}
                    >
                      Use in replace
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!sources.length && !loading ? (
              <tr>
                <td colSpan={7} className="xui-streams-empty">
                  No sources found.
                </td>
              </tr>
            ) : null}
            {loading ? (
              <tr>
                <td colSpan={7} className="xui-streams-empty">
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ListPagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} noun="sources" />
    </div>
  );
}
