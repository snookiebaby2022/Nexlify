"use client";

import { useCallback, useEffect, useState } from "react";
import { ManageLinesTable, type ManageLineRow } from "@/components/manage-lines-table";
import type { ManageLinesPageResult } from "@/lib/manage-lines-list";

type LineSortKey = "username" | "expiresAt" | "owner" | "createdAt";
type StatusFilter = "all" | "ACTIVE" | "DISABLED" | "BANNED";
type TrialFilter = "all" | "yes" | "no";

export function AdminLinesClient({
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
  const [total, setTotal] = useState(initial.pagination.total);
  const [page, setPage] = useState(initial.pagination.page);
  const [pageSize, setPageSize] = useState(initial.pagination.pageSize);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LineSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [trialFilter, setTrialFilter] = useState<TrialFilter>("all");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true;
      setLoadError("");
      if (!soft) setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
        sortDir,
      });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (trialFilter !== "all") params.set("trial", trialFilter);
      fetch(`/api/admin/lines?${params}`)
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || `Failed to load lines (${r.status})`);
          setLines(d.lines ?? []);
          setTotal(d.pagination?.total ?? d.lines?.length ?? 0);
        })
        .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load lines"))
        .finally(() => setLoading(false));
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
    <div className="space-y-6">
      {loadError ? (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {loadError}{" "}
          <button type="button" className="underline" onClick={() => load()}>
            Retry
          </button>
        </p>
      ) : null}
      {!loadError && loading ? (
        <p className="text-xs px-1" style={{ color: "var(--muted)" }}>
          Refreshing lines…
        </p>
      ) : null}
      <ManageLinesTable
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
    </div>
  );
}
