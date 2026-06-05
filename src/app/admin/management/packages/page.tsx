"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { PackageForm } from "@/components/package-form";

export default function ManagementPackagesPage() {
  const [packages, setPackages] = useState<
    { id: string; name: string; creditCost: number; days: number; maxLines: number; bouquetIds: string[] }[]
  >([]);

  function load() {
    fetch("/api/admin/packages").then((r) => r.json()).then((d) => setPackages(d.packages));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-8 max-w-4xl">
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
        headers={["Name", "Credits", "Days", "Max lines", "Bouquets"]}
        rows={packages.map((p) => [
          p.name,
          p.creditCost,
          p.days,
          p.maxLines,
          p.bouquetIds.length,
        ])}
      />
    </div>
  );
}
