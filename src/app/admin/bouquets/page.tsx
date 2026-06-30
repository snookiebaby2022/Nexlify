"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ManageBouquetsTable, type ManageBouquetRow } from "@/components/manage-bouquets-table";

export default function AdminBouquetsPage() {
  const [bouquets, setBouquets] = useState<
    {
      id: string;
      name: string;
      isActive: boolean;
      sortOrder: number;
      streams: { stream: { name: string } }[];
      _count?: { lines: number };
    }[]
  >([]);

  const load = useCallback(() => {
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets ?? []));
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
        streamCount: b.streams?.length ?? 0,
        lineCount: b._count?.lines ?? 0,
        sortOrder: b.sortOrder,
      })),
    [bouquets]
  );

  return (
    <div className="space-y-4">
      <ManageBouquetsTable bouquets={rows} onRefresh={load} />
    </div>
  );
}
