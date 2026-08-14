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

  const [loadError, setLoadError] = useState("");

  const load = useCallback(() => {
    setLoadError("");
    fetch("/api/admin/lines?page=1&pageSize=5000")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Failed to load lines (${r.status})`);
        setLines(d.lines ?? []);
        setTotal(d.pagination?.total ?? d.lines?.length ?? 0);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load lines"));
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
