"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";

export default function ResellerMagsPage() {
  const [items, setItems] = useState<
    { id: string; mac: string; model: string | null; line?: { username: string } }[]
  >([]);

  useEffect(() => {
    fetch("/api/admin/mag")
      .then((r) => r.json())
      .then((d) => setItems(d.devices ?? d.mags ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">MAG devices</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            MAG boxes linked to your subscription lines.
          </p>
        </div>
        <Link
          href="/reseller/mags/add"
          className="text-sm px-3 py-2 rounded-md font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          + Add MAG device
        </Link>
      </div>
      <DataTable
        headers={["MAC", "Model", "Line"]}
        rows={items.map((m) => [
          m.mac,
          m.model ?? "—",
          m.line?.username ?? "—",
        ])}
      />
    </div>
  );
}
