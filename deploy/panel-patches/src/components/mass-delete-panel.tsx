"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Entity = "streams" | "lines" | "users";

const PAGE_SIZES = [25, 50, 100, 200] as const;

export function MassDeletePanel({
  entity,
  title,
  loadUrl,
  labelKey,
  streamType,
}: {
  entity: Entity;
  title: string;
  loadUrl: string;
  labelKey: string;
  streamType?: "LIVE" | "MOVIE" | "SERIES";
}) {
  const [rows, setRows] = useState<{ id: string; [k: string]: unknown }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      lite: "1",
    });
    if (entity === "streams" && streamType) params.set("type", streamType);
    const sep = loadUrl.includes("?") ? "&" : "?";
    fetch(`${loadUrl}${sep}${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (entity === "streams") {
          setRows(d.streams ?? []);
          setTotal(d.total ?? d.streams?.length ?? 0);
        } else if (entity === "lines") {
          setRows(d.lines ?? []);
          setTotal(d.total ?? d.lines?.length ?? 0);
        } else {
          const list = (d.resellers ?? []).filter((u: { role: string }) => u.role !== "ADMIN");
          setRows(list);
          setTotal(d.total ?? list.length);
        }
      });
  }, [loadUrl, entity, page, pageSize, streamType]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }

  function togglePage() {
    const ids = rows.map((r) => r.id);
    const allOnPage = ids.every((id) => selected.has(id));
    const n = new Set(selected);
    if (allOnPage) ids.forEach((id) => n.delete(id));
    else ids.forEach((id) => n.add(id));
    setSelected(n);
  }

  async function remove() {
    if (!selected.size) return;
    if (!confirm(`Permanently delete ${selected.size} ${entity}?`)) return;
    const ids = [...selected];
    const chunk = 20;
    setDeleting(true);
    setProgress(0);
    setMsg("");
    let deleted = 0;
    for (let i = 0; i < ids.length; i += chunk) {
      const batch = ids.slice(i, i + chunk);
      const res = await fetch("/api/admin/tools/mass-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, ids: batch }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Delete failed");
        setDeleting(false);
        return;
      }
      deleted += data.count ?? batch.length;
      setProgress(Math.round(((i + batch.length) / ids.length) * 100));
    }
    setMsg(`Deleted ${deleted} item(s).`);
    setSelected(new Set());
    setDeleting(false);
    setProgress(100);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <h1 className="text-2xl font-semibold flex-1">{title}</h1>
        <Link href="/admin/management/tools/mass-delete" className="text-sm link-back">
          ← Mass delete
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 items-center text-sm">
        <label className="flex items-center gap-2">
          Show
          <select
            className="panel-select rounded border px-2 py-1"
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
          per page
        </label>
        <span style={{ color: "var(--muted)" }}>
          {total} total · page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="rounded border px-2 py-1 cursor-pointer disabled:opacity-40"
          style={{ borderColor: "var(--border)" }}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
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

      <button
        type="button"
        disabled={deleting || !selected.size}
        onClick={remove}
        className="rounded px-4 py-2 cursor-pointer disabled:opacity-60"
        style={{ background: "var(--danger)", color: "#fff" }}
      >
        {deleting ? `Deleting… ${progress}%` : `Delete ${selected.size || "…"} selected`}
      </button>

      {deleting && (
        <div className="w-full max-w-md h-2 rounded overflow-hidden" style={{ background: "var(--border)" }}>
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
          />
        </div>
      )}
      {msg && <p className="text-sm">{msg}</p>}

      <div className="rounded-lg border overflow-auto max-h-[60vh]" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onChange={togglePage}
                />
              </th>
              <th className="text-left p-3">Name</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td className="p-3">{String(r[labelKey] ?? r.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
