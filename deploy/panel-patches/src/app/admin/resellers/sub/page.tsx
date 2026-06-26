"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";

export default function AdminSubResellersPage() {
  const [resellers, setResellers] = useState<
    {
      username: string;
      credits: number;
      parent?: { username: string } | null;
      _count: { lines: number };
    }[]
  >([]);

  useEffect(() => {
    fetch("/api/admin/resellers/sub")
      .then((r) => r.json())
      .then((d) => setResellers(d.resellers));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Sub-resellers</h1>
      <DataTable
        headers={["Username", "Parent", "Credits", "Lines"]}
        rows={resellers.map((r) => [
          r.username,
          r.parent?.username ?? "—",
          r.credits,
          r._count.lines,
        ])}
      />
    </div>
  );
}
