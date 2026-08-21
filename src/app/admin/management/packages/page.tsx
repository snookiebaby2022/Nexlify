"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { PackageForm } from "@/components/package-form";

type PackageRow = {
  id: string;
  name: string;
  creditCost: number;
  days: number;
  maxLines: number;
  bouquetIds: string[];
  allowResellers: boolean;
  allowSubResellers: boolean;
  isActive: boolean;
};

export default function ManagementPackagesPage() {
  const [packages, setPackages] = useState<PackageRow[]>([]);

  function load() {
    fetch("/api/admin/packages?manage=1")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string, name: string) {
    if (!confirm(`Delete package "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/packages?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Delete failed");
      return;
    }
    load();
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Packages</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Subscription packages for lines (credits, duration, bouquets).
          </p>
        </div>
        <Link
          href="/admin/management/packages/add"
          className="rounded py-2 px-4 text-sm"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add package
        </Link>
      </div>

      <PackageForm title="Quick add" submitLabel="Add package" onSuccess={load} />

      <DataTable
        headers={["Name", "Credits", "Days", "Max lines", "Bouquets", "Resellers", "Status", ""]}
        rows={packages.map((p) => [
          p.name,
          p.creditCost,
          p.days,
          p.maxLines,
          p.bouquetIds.length,
          [
            p.allowResellers !== false ? "Reseller" : null,
            p.allowSubResellers !== false ? "Sub" : null,
          ]
            .filter(Boolean)
            .join(", ") || "—",
          p.isActive !== false ? "Active" : "Inactive",
          <span key={p.id} className="flex gap-2">
            <Link href={`/admin/management/packages/${p.id}/edit`} className="text-xs" style={{ color: "var(--accent)" }}>
              Edit
            </Link>
            <button
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--danger)" }}
              onClick={() => remove(p.id, p.name)}
            >
              Delete
            </button>
          </span>,
        ])}
      />
    </div>
  );
}
