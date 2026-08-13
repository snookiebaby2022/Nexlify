"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ManageLinesTable, type ManageLineRow } from "@/components/manage-lines-table";

function ResellerLinesContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [lines, setLines] = useState<ManageLineRow[]>([]);
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    setError("");
    Promise.all([
      fetch("/api/reseller/lines?page=1&pageSize=5000").then(async (r) => {
        if (!r.ok) throw new Error("lines");
        return r.json();
      }),
      fetch("/api/reseller/bouquets").then(async (r) => {
        if (!r.ok) throw new Error("bouquets");
        return r.json();
      }),
    ])
      .then(([linesData, bouquetData]) => {
        setLines(linesData.lines ?? []);
        setTotal(linesData.pagination?.total ?? linesData.lines?.length ?? 0);
        setBouquets(bouquetData.bouquets ?? []);
      })
      .catch(() => {
        setError("Could not load lines. Refresh the page or sign in again.");
        setLines([]);
        setBouquets([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      {error && (
        <p className="text-sm mb-4 px-1" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {total > lines.length ? (
        <p className="text-xs mb-2 px-1" style={{ color: "var(--muted)" }}>
          Showing {lines.length.toLocaleString()} of {total.toLocaleString()} lines (newest first).
        </p>
      ) : null}
      <ManageLinesTable
        panel="reseller"
        lines={lines}
        bouquets={bouquets}
        editLineId={editId}
        onRefresh={load}
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
