"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ManageLinesTable, type ManageLineRow } from "@/components/manage-lines-table";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-page-sizes";

function ResellerLinesContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [lines, setLines] = useState<ManageLineRow[]>([]);
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const loadGen = useRef(0);

  const load = useCallback(
    (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true;
      setError("");
      if (!soft) setLoading(true);
      const gen = ++loadGen.current;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());

      fetch(`/api/reseller/lines?${params}`)
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || `Failed to load lines (${r.status})`);
          if (gen !== loadGen.current) return;
          setLines(d.lines ?? []);
          setTotal(d.pagination?.total ?? d.lines?.length ?? 0);
        })
        .catch((e) => {
          if (gen !== loadGen.current) return;
          // Keep previous rows so intermittent refresh failures don't blank the table.
          setError(e instanceof Error ? e.message : "Could not load lines. Refresh or sign in again.");
        })
        .finally(() => {
          if (gen === loadGen.current) setLoading(false);
        });
    },
    [page, pageSize, search]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/reseller/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets ?? []))
      .catch(() => {});
  }, []);

  const softRefresh = useCallback(() => load({ soft: true }), [load]);

  return (
    <>
      {error && (
        <p className="text-sm mb-4 px-1" style={{ color: "var(--danger)" }}>
          {error}{" "}
          <button type="button" className="underline" onClick={() => load()}>
            Retry
          </button>
        </p>
      )}
      {loading ? (
        <p className="text-xs mb-2 px-1" style={{ color: "var(--muted)" }}>
          Loading lines…
        </p>
      ) : (
        <p className="text-xs mb-2 px-1" style={{ color: "var(--muted)" }}>
          Showing {lines.length.toLocaleString()} of {total.toLocaleString()} lines (newest first).
        </p>
      )}
      <ManageLinesTable
        panel="reseller"
        lines={lines}
        bouquets={bouquets}
        editLineId={editId}
        onRefresh={softRefresh}
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
    </>
  );
}

export default function ResellerLinesPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm p-6" style={{ color: "var(--muted)" }}>
          Loading lines…
        </p>
      }
    >
      <ResellerLinesContent />
    </Suspense>
  );
}
