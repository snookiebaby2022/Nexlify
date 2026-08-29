"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ManageLinesTable, type ManageLineRow } from "@/components/manage-lines-table";
import type { ManageLinesPageResult } from "@/lib/manage-lines-list";

type LineSortKey = "username" | "expiresAt" | "owner" | "createdAt";
type StatusFilter = "all" | "ACTIVE" | "DISABLED" | "BANNED";
type TrialFilter = "all" | "yes" | "no";

export function ResellerLinesClient({
  initial,
  initialBouquets,
  editId,
}: {
  initial: ManageLinesPageResult;
  initialBouquets: { id: string; name: string }[];
  editId?: string | null;
}) {
  const [lines, setLines] = useState<ManageLineRow[]>(initial.lines);
  const [bouquets] = useState(initialBouquets);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(initial.pagination.total);
  const [page, setPage] = useState(initial.pagination.page);
  const [pageSize, setPageSize] = useState(initial.pagination.pageSize);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LineSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [trialFilter, setTrialFilter] = useState<TrialFilter>("all");
  const [loading, setLoading] = useState(false);
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
    [page, pageSize, search, sort, sortDir, statusFilter, trialFilter]
  );

  useEffect(() => {
    if (
      page === initial.pagination.page &&
      pageSize === initial.pagination.pageSize &&
      !search.trim() &&
      sort === "createdAt" &&
      sortDir === "desc" &&
      statusFilter === "all" &&
      trialFilter === "all"
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
    initial.pagination.page,
    initial.pagination.pageSize,
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
        loading={false}
        serverTotal={total}
        serverPage={page}
        serverPageSize={pageSize}
        serverSearch={search}
        serverSort={sort}
        serverSortDir={sortDir}
        serverStatusFilter={statusFilter}
        serverTrialFilter={trialFilter}
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
      />
    </>
  );
}
