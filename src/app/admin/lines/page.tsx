"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ManageLinesTable, type ManageLineRow } from "@/components/manage-lines-table";

function AdminLinesContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [lines, setLines] = useState<ManageLineRow[]>([]);
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    fetch("/api/admin/lines?page=1&pageSize=5000")
      .then((r) => r.json())
      .then((d) => {
        setLines(d.lines ?? []);
        setTotal(d.pagination?.total ?? d.lines?.length ?? 0);
      });
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      {total > lines.length ? (
        <p className="text-xs px-1" style={{ color: "var(--muted)" }}>
          Showing {lines.length.toLocaleString()} of {total.toLocaleString()} lines (newest first).
        </p>
      ) : null}
      <ManageLinesTable
        lines={lines}
        bouquets={bouquets}
        editLineId={editId}
        onRefresh={load}
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
