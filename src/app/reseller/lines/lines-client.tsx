"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ManageLinesTable, type LineSortKey, type ManageLineRow, type StatusFilter, type TrialFilter } from "@/components/manage-lines-table";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-page-sizes";
import type { ManageLinesPageResult } from "@/lib/manage-lines-list";

export function ResellerLinesClient({
  initial = null,
  initialBouquets = [],
  editId,
}: {
  initial?: ManageLinesPageResult | null;
  initialBouquets?: { id: string; name: string }[];
  editId?: string | null;
}) {
  const [lines, setLines] = useState<ManageLineRow[]>(initial?.lines ?? []);
  const [bouquets] = useState(initialBouquets);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(initial?.pagination.total ?? 0);
  const [page, setPage] = useState(initial?.pagination.page ?? 1);
  const [pageSize, setPageSize] = useState(initial?.pagination.pageSize ?? DEFAULT_LIST_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LineSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [trialFilter, setTrialFilter] = useState<TrialFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [bouquetFilter, setBouquetFilter] = useState("");
  const [loading, setLoading] = useState(!initial);
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
        sort,
        sortDir,
      });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (trialFilter !== "all") params.set("trial", trialFilter);
      if (ownerFilter) params.set("ownerId", ownerFilter);
      if (bouquetFilter) params.set("bouquetId", bouquetFilter);

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
          setError(e instanceof Error ? e.message : "Could not load lines. Refresh or sign in again.");
        })
        .finally(() => {
          if (gen === loadGen.current) setLoading(false);
        });
    },
    [page, pageSize, search, sort, sortDir, statusFilter, trialFilter, ownerFilter, bouquetFilter]
  );

  useEffect(() => {
    if (
      initial &&
      page === initial.pagination.page &&
      pageSize === initial.pagination.pageSize &&
      !search.trim() &&
      sort === "createdAt" &&
      sortDir === "desc" &&
      statusFilter === "all" &&
      trialFilter === "all" &&
      !ownerFilter &&
      !bouquetFilter
    ) {
      return;
    }
    load();
  }, [
    load,
    page,
    pageSize,
    search,
    sort,
    sortDir,
    statusFilter,
    trialFilter,
    ownerFilter,
    bouquetFilter,
    initial,
  ]);

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
          Refreshing lines…
        </p>
      ) : null}
      <ManageLinesTable
        panel="reseller"
        lines={lines}
        bouquets={bouquets}
        editLineId={editId}
        onRefresh={() => load({ soft: true })}
        loading={loading}
        serverTotal={total}
        serverPage={page}
        serverPageSize={pageSize}
        serverSearch={search}
        serverSort={sort}
        serverSortDir={sortDir}
        serverStatusFilter={statusFilter}
        serverTrialFilter={trialFilter}
        serverOwnerFilter={ownerFilter}
        serverBouquetFilter={bouquetFilter}
        onServerPageChange={setPage}
        onServerPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        onServerSearchChange={(q) => {
          setSearch(q);
          setPage(1);
        }}
        onServerSortChange={(key, dir) => {
          setSort(key);
          setSortDir(dir);
          setPage(1);
        }}
        onServerStatusFilterChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onServerTrialFilterChange={(value) => {
          setTrialFilter(value);
          setPage(1);
        }}
        onServerOwnerFilterChange={(value) => {
          setOwnerFilter(value);
          setPage(1);
        }}
        onServerBouquetFilterChange={(value) => {
          setBouquetFilter(value);
          setPage(1);
        }}
      />
    </>
  );
}
