"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";

export default function ResellerEnigmasPage() {
  const [devices, setDevices] = useState<
    { id: string; mac: string; model: string | null; line: { username: string } }[]
  >([]);

  function load() {
    fetch("/api/admin/enigma")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Enigma devices</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Enigma2 boxes linked to your lines.
          </p>
        </div>
        <Link
          href="/reseller/enigmas/add"
          className="text-sm px-3 py-2 rounded-md font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          + Add Enigma device
        </Link>
      </div>
      <DataTable
        headers={["MAC", "Model", "Line"]}
        rows={devices.map((d) => [d.mac, d.model ?? "—", d.line?.username ?? "—"])}
      />
    </div>
  );
}
