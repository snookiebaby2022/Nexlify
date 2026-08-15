"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ManageBouquetsTable, type ManageBouquetRow } from "@/components/manage-bouquets-table";

type BouquetListItem = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  streams?: unknown[];
  _count?: { lines?: number; streams?: number };
  contentCounts?: { total?: number; streams?: number; movies?: number; series?: number };
};

export default function AdminBouquetsPage() {
  const [bouquets, setBouquets] = useState<BouquetListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/bouquets", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setBouquets([]);
          setError(typeof d.error === "string" ? d.error : `Failed to load bouquets (${r.status})`);
          return;
        }
        setBouquets(Array.isArray(d.bouquets) ? d.bouquets : []);
      })
      .catch((e) => {
        setBouquets([]);
        setError(e instanceof Error ? e.message : "Failed to load bouquets");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows: ManageBouquetRow[] = useMemo(
    () =>
      bouquets.map((b, i) => ({
        id: b.id,
        displayId: i + 1,
        name: b.name,
        isActive: b.isActive,
        streamCount:
          b.contentCounts?.total ??
          b._count?.streams ??
          (Array.isArray(b.streams) ? b.streams.length : 0),
        lineCount: b._count?.lines ?? 0,
        sortOrder: b.sortOrder,
      })),
    [bouquets]
  );

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm" style={{ color: "#ef4444" }}>
          {error}
        </p>
      ) : null}
      {loading && rows.length === 0 ? (
        <p className="text-sm opacity-70">Loading bouquets…</p>
      ) : (
        <ManageBouquetsTable bouquets={rows} onRefresh={load} />
      )}
    </div>
  );
}
