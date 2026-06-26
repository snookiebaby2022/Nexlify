"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";

export default function AdminBouquetsPage() {
  const [bouquets, setBouquets] = useState<
    {
      id: string;
      name: string;
      isActive: boolean;
      streams: { stream: { name: string } }[];
      _count?: { lines: number };
    }[]
  >([]);

  function load() {
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <h1 className="text-2xl font-semibold">Manage bouquets</h1>
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/bouquets/add"
            className="px-3 py-2 rounded-md"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + Add bouquet
          </Link>
          <Link
            href="/admin/bouquets/order"
            className="px-3 py-2 rounded-md border"
            style={{ borderColor: "var(--border)" }}
          >
            Order
          </Link>
        </div>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Use the dual-list editor to assign streams to each bouquet.
      </p>
      <DataTable
        headers={["Name", "Streams", "Lines", ""]}
        rows={bouquets.map((b) => [
          b.name,
          String(b.streams?.length ?? 0),
          String(b._count?.lines ?? 0),
          <Link
            key={b.id}
            href={`/admin/bouquets/${b.id}`}
            className="text-sm"
            style={{ color: "var(--accent)" }}
          >
            Edit
          </Link>,
        ])}
      />
    </div>
  );
}
