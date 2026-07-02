"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ManageLinesTable, type ManageLineRow } from "@/components/manage-lines-table";

function ResellerLinesContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [lines, setLines] = useState<ManageLineRow[]>([]);
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");

  function load() {
    setError("");
    Promise.all([
      fetch("/api/admin/lines").then(async (r) => {
        if (!r.ok) throw new Error("lines");
        return r.json();
      }),
      fetch("/api/admin/bouquets").then(async (r) => {
        if (!r.ok) throw new Error("bouquets");
        return r.json();
      }),
    ])
      .then(([linesData, bouquetData]) => {
        setLines(linesData.lines ?? []);
        setBouquets(bouquetData.bouquets ?? []);
      })
      .catch(() => {
        setError("Could not load lines. Refresh the page or sign in again.");
        setLines([]);
        setBouquets([]);
      });
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      {error && (
        <p className="text-sm mb-4 px-1" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
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
