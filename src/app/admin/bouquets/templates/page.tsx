"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  days: number;
  creditCost: number;
  bouquetIds: string[];
  isActive: boolean;
};

export default function BouquetTemplatesPage() {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [bouquetNames, setBouquetNames] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/packages").then((r) => r.json()),
      fetch("/api/admin/bouquets").then((r) => r.json()),
    ]).then(([pkgData, bouqData]) => {
      setPackages(pkgData.packages ?? []);
      const map: Record<string, string> = {};
      for (const b of bouqData.bouquets ?? []) map[b.id] = b.name;
      setBouquetNames(map);
    });
  }, []);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bouquet Templates</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Package templates apply bouquet selections in one click when creating lines or MAG devices.
          </p>
        </div>
        <Link href="/admin/management/packages/add" className="btn-positive rounded px-4 py-2 text-sm font-medium">
          Add template
        </Link>
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "rgba(0,0,0,0.2)" }}>
            <tr>
              <th className="text-left p-3">Template</th>
              <th className="text-left p-3">Duration</th>
              <th className="text-left p-3">Credits</th>
              <th className="text-left p-3">Bouquets</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {packages.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center" style={{ color: "var(--muted)" }}>
                  No package templates yet.{" "}
                  <Link href="/admin/management/packages/add" className="underline" style={{ color: "var(--accent)" }}>
                    Create one
                  </Link>
                </td>
              </tr>
            ) : (
              packages.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">
                    <strong>{p.name}</strong>
                    {p.description && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                        {p.description}
                      </p>
                    )}
                  </td>
                  <td className="p-3">{p.days} days</td>
                  <td className="p-3">{p.creditCost}</td>
                  <td className="p-3 text-xs">
                    {p.bouquetIds.length
                      ? p.bouquetIds.map((id) => bouquetNames[id] ?? id.slice(0, 8)).join(", ")
                      : "—"}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/management/packages?edit=${p.id}`}
                      className="text-xs underline"
                      style={{ color: "var(--accent)" }}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Use templates from{" "}
        <Link href="/admin/lines/add-package" className="underline" style={{ color: "var(--accent)" }}>
          Add Line (with Package)
        </Link>{" "}
        or MAG device package flows.
      </p>
    </div>
  );
}
