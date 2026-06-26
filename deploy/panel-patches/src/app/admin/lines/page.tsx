"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ManageLinesTable, type ManageLineRow } from "@/components/manage-lines-table";
function AdminLinesContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [lines, setLines] = useState<ManageLineRow[]>([]);
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);
  function load() {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines ?? []));
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
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
