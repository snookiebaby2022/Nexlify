"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Power, RefreshCw, Trash2, Wrench } from "lucide-react";
import { adminToast } from "@/lib/admin-toast";
import { notifyStreamHealthChanged } from "@/lib/stream-health-events";

type StreamRow = {
  id: string;
  name: string;
  type: "LIVE" | "MOVIE" | "SERIES" | string;
  streamUrl: string;
  isActive: boolean;
  lastProbeOk: boolean | null;
  lastProbeError: string | null;
  category?: { id: string; name: string } | null;
  server?: { id: string; name: string } | null;
};

type TypeFilter = "ALL" | "LIVE" | "MOVIE" | "SERIES";

const PAGE_SIZE = 50;

export function DisabledStreamsClient() {
  const searchParams = useSearchParams();
  const initialType = (searchParams.get("type") || "ALL").toUpperCase() as TypeFilter;
  const [type, setType] = useState<TypeFilter>(
    initialType === "LIVE" || initialType === "MOVIE" || initialType === "SERIES" ? initialType : "ALL"
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [rows, setRows] = useState<StreamRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const qs = new URLSearchParams({
        status: "inactive",
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (type !== "ALL") qs.set("type", type);
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/admin/streams?${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setRows(data.streams ?? []);
      setTotal(Number(data.total ?? 0));
      setTotalPages(Number(data.totalPages ?? Math.ceil(Number(data.total ?? 0) / PAGE_SIZE)));
      setSelected(new Set());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load disabled streams");
      setRows([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleAllPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function massAction(action: "enable" | "disable" | "delete") {
    const ids = [...selected];
    if (!ids.length) {
      adminToast("Select streams first", "error");
      return;
    }
    if (action === "delete") {
      const ok = window.confirm(`Permanently delete ${ids.length} selected stream(s)?`);
      if (!ok) return;
    }
    setBusy(action);
    setMsg("");
    try {
      const res = await fetch("/api/admin/streams/mass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Action failed");
      const count = Number(data.count ?? ids.length);
      adminToast(
        action === "enable"
          ? `Activated ${count}`
          : action === "disable"
            ? `Deactivated ${count}`
            : `Deleted ${count}`,
        "success"
      );
      notifyStreamHealthChanged();
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Action failed";
      setMsg(err);
      adminToast(err, "error");
    } finally {
      setBusy(null);
    }
  }

  async function probeSelected() {
    const ids = [...selected].slice(0, PAGE_SIZE);
    if (!ids.length) {
      adminToast("Select streams first", "error");
      return;
    }
    setBusy("probe");
    setMsg("");
    try {
      const res = await fetch("/api/admin/streams/probe-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamIds: ids, fast: false }),
      });
      const data = (await res.json()) as {
        results?: Record<string, { lastProbeOk?: boolean; error?: string }>;
        error?: string;
      };
      if (!res.ok || !data.results) throw new Error(data.error || "Probe failed");
      let ok = 0;
      for (const id of ids) {
        const row = data.results[id];
        if (row && !row.error && row.lastProbeOk) ok += 1;
      }
      adminToast(`Probed ${ids.length}: ${ok} online`, "success");
      notifyStreamHealthChanged();
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Probe failed";
      setMsg(err);
      adminToast(err, "error");
    } finally {
      setBusy(null);
    }
  }

  async function activateAll() {
    const ok = window.confirm(
      `Activate all ${total.toLocaleString()} disabled stream(s)${type !== "ALL" ? ` (${type})` : ""}?`
    );
    if (!ok) return;
    setBusy("activate-all");
    setMsg("");
    try {
      const body =
        type === "ALL"
          ? { action: "enable_all_inactive" }
          : { action: "enable_by_type", type };
      const res = await fetch("/api/admin/streams/fix-inactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Activate all failed");
      adminToast(`Activated ${Number(data.updated ?? 0).toLocaleString()}`, "success");
      notifyStreamHealthChanged();
      setPage(1);
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Activate all failed";
      setMsg(err);
      adminToast(err, "error");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAll() {
    const label = type !== "ALL" ? `disabled ${type}` : "disabled";
    const ok = window.confirm(
      `Permanently delete ALL ${total.toLocaleString()} ${label} stream(s)? This cannot be undone.`
    );
    if (!ok) return;
    const ok2 = window.confirm("Last chance — delete all disabled streams now?");
    if (!ok2) return;
    setBusy("delete-all");
    setMsg("");
    try {
      const body =
        type === "ALL"
          ? { action: "delete_all_inactive" }
          : { action: "delete_all_inactive", type };
      const res = await fetch("/api/admin/streams/fix-inactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Delete all failed");
      adminToast(`Deleted ${Number(data.deleted ?? 0).toLocaleString()}`, "success");
      notifyStreamHealthChanged();
      setPage(1);
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Delete all failed";
      setMsg(err);
      adminToast(err, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <div className="xui-lines-header flex flex-wrap items-center gap-2">
          <Power size={18} className="text-red-400 shrink-0" />
          <div className="flex-1 min-w-[160px]">
            <h1 className="text-base font-semibold">Disabled streams</h1>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Still in the catalog — players cannot see them until activated. Showing {PAGE_SIZE} per page.
            </p>
          </div>
          <Link href="/admin" className="xui-lines-header-btn xui-lines-header-btn--outline text-xs">
            Dashboard
          </Link>
          <Link href="/admin/stream_errors" className="xui-lines-header-btn xui-lines-header-btn--outline text-xs">
            Stream errors
          </Link>
        </div>

        <div className="xui-lines-toolbar flex-wrap gap-2">
          <select
            className="xui-lines-select"
            value={type}
            onChange={(e) => {
              setType(e.target.value as TypeFilter);
              setPage(1);
            }}
          >
            <option value="ALL">All types</option>
            <option value="LIVE">Live</option>
            <option value="MOVIE">Movies</option>
            <option value="SERIES">Series</option>
          </select>
          <div className="xui-lines-search-wrap flex-1 min-w-[180px] max-w-md">
            <input
              className="xui-lines-search-input w-full"
              placeholder="Search name or URL…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(searchDraft);
                  setPage(1);
                }
              }}
            />
          </div>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            onClick={() => {
              setSearch(searchDraft);
              setPage(1);
            }}
          >
            Search
          </button>
          <button type="button" className="xui-lines-toolbar-btn" onClick={() => void load()} disabled={Boolean(busy)}>
            <RefreshCw size={14} className="inline mr-1" /> Refresh
          </button>
          <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--muted)" }}>
            {total.toLocaleString()} disabled
            {selected.size ? ` · ${selected.size} selected` : ""}
          </span>
        </div>

        <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            disabled={!selected.size || Boolean(busy)}
            onClick={() => void massAction("enable")}
          >
            {busy === "enable" ? "…" : "Activate"}
          </button>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            disabled={!selected.size || Boolean(busy)}
            onClick={() => void massAction("disable")}
          >
            {busy === "disable" ? "…" : "De-activate"}
          </button>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            disabled={!selected.size || Boolean(busy)}
            onClick={() => void probeSelected()}
          >
            {busy === "probe" ? "Probing…" : "Probe"}
          </button>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            disabled={!selected.size || Boolean(busy)}
            onClick={() => void massAction("delete")}
            style={{ color: "#ef4444" }}
          >
            {busy === "delete" ? "…" : "Delete"}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            disabled={Boolean(busy) || total === 0}
            onClick={() => void activateAll()}
            className="text-xs px-3 py-1.5 rounded text-white inline-flex items-center gap-1 disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            <Wrench size={12} />
            {busy === "activate-all" ? "Activating…" : "Activate all"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || total === 0}
            onClick={() => void deleteAll()}
            className="text-xs px-3 py-1.5 rounded text-white inline-flex items-center gap-1 disabled:opacity-50"
            style={{ background: "#dc2626" }}
          >
            <Trash2 size={12} />
            {busy === "delete-all" ? "Deleting…" : "Delete all"}
          </button>
        </div>

        {msg ? (
          <p className="px-3 py-2 text-xs text-red-400 border-t" style={{ borderColor: "var(--border)" }}>
            {msg}
          </p>
        ) : null}

        <div className="overflow-x-auto border-t" style={{ borderColor: "var(--border)" }}>
          <table className="xui-lines-table w-full text-sm min-w-[900px]">
            <thead>
              <tr>
                <th className="xui-lines-th xui-lines-td--check">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleAllPage}
                    aria-label="Select all on this page"
                  />
                </th>
                <th className="xui-lines-th">Name</th>
                <th className="xui-lines-th">Type</th>
                <th className="xui-lines-th">Category</th>
                <th className="xui-lines-th">Server</th>
                <th className="xui-lines-th">Probe</th>
                <th className="xui-lines-th">Source</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="xui-lines-td text-center py-8" style={{ color: "var(--muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="xui-lines-td text-center py-8" style={{ color: "var(--muted)" }}>
                    No disabled streams
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "xui-lines-row--even" : "xui-lines-row--odd"}>
                    <td className="xui-lines-td xui-lines-td--check">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    <td className="xui-lines-td">
                      <Link href={`/admin/content/streams?edit=${row.id}`} className="xui-lines-username">
                        {row.name}
                      </Link>
                    </td>
                    <td className="xui-lines-td text-xs">{row.type}</td>
                    <td className="xui-lines-td text-xs" style={{ color: "var(--muted)" }}>
                      {row.category?.name ?? "—"}
                    </td>
                    <td className="xui-lines-td text-xs" style={{ color: "var(--muted)" }}>
                      {row.server?.name ?? "—"}
                    </td>
                    <td className="xui-lines-td text-xs">
                      {row.lastProbeOk === true ? (
                        <span className="text-emerald-400">OK</span>
                      ) : row.lastProbeOk === false ? (
                        <span className="text-red-400" title={row.lastProbeError ?? ""}>
                          Fail
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td className="xui-lines-td text-xs max-w-[240px] truncate font-mono" style={{ color: "var(--muted)" }} title={row.streamUrl}>
                      {row.streamUrl}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            disabled={page <= 1 || Boolean(busy)}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
            Page {page} of {Math.max(1, totalPages)} · {PAGE_SIZE} / page
          </span>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            disabled={page >= totalPages || totalPages === 0 || Boolean(busy)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
