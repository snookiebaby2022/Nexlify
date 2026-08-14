"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ManageLinesTable, type ManageLineRow } from "@/components/manage-lines-table";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-page-sizes";

function AdminLinesContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [lines, setLines] = useState<ManageLineRow[]>([]);
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoadError("");
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/admin/lines?${params}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Failed to load lines (${r.status})`);
        setLines(d.lines ?? []);
        setTotal(d.pagination?.total ?? d.lines?.length ?? 0);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load lines"))
      .finally(() => setLoading(false));
  }, [page, pageSize, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {loadError ? (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {loadError}{" "}
          <button type="button" className="underline" onClick={load}>
            Retry
          </button>
        </p>
      ) : null}
      {loading ? (
        <p className="text-xs px-1" style={{ color: "var(--muted)" }}>
          Loading lines…
        </p>
      ) : (
        <p className="text-xs px-1" style={{ color: "var(--muted)" }}>
          Showing {lines.length.toLocaleString()} of {total.toLocaleString()} lines (newest first).
        </p>
      )}
      <ManageLinesTable
        lines={lines}
        bouquets={bouquets}
        editLineId={editId}
        onRefresh={load}
        serverTotal={total}
        serverPage={page}
        serverPageSize={pageSize}
        serverSearch={search}
        onServerPageChange={setPage}
        onServerPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        onServerSearchChange={(q) => {
          setSearch(q);
          setPage(1);
        }}
      />
    </div>
  );
}

export default function AdminLinesPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm p-6" style={{ color: "var(--muted)" }}>
          Loading lines…
        </p>
      }
    >
      <AdminLinesContent />
    </Suspense>
  );
}
