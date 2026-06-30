"use client";

import { useCallback, useEffect, useState } from "react";
import { ManageSubResellersTable, type ManageSubResellerRow } from "@/components/manage-sub-resellers-table";

export default function AdminSubResellersPage() {
  const [resellers, setResellers] = useState<ManageSubResellerRow[]>([]);

  const load = useCallback(() => {
    fetch("/api/admin/resellers/sub")
      .then((r) => r.json())
      .then((d) => setResellers(d.resellers ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <ManageSubResellersTable resellers={resellers} onRefresh={load} />
    </div>
  );
}
