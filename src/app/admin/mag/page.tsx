"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
export default function AdminMagAllPage() {
  const [portalUrl, setPortalUrl] = useState("—");
  const [devices, setDevices] = useState<
    {
      id: string;
      mac: string;
      model: string | null;
      isActive: boolean;
      line: { username: string };
    }[]
  >([]);

  function load() {
    fetch("/api/admin/mag")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch("/api/admin/portal-urls")
      .then((r) => r.json())
      .then((d) => setPortalUrl(d.magServerUrl || "—"))
      .catch(() => {});
  }, []);

  async function remove(id: string) {
    await fetch(`/api/admin/mag?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">All MAG boxes</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Portal: <code>{portalUrl}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/mag/add"
            className="text-sm px-3 py-2 rounded-md btn-positive"
          >
            + Add device
          </Link>
          <Link
            href="/admin/mag/bulk"
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: "var(--border)" }}
          >
            Bulk add
          </Link>
        </div>
      </div>

      <DataTable
        headers={["MAC", "Line", "Model", "Status", ""]}
        rows={devices.map((d) => [
          d.mac,
          d.line.username,
          d.model ?? "—",
          d.isActive ? "Active" : "Off",
          <span key={d.id} className="flex gap-2">
            <Link href={`/admin/mag/${d.id}/edit`} className="text-xs" style={{ color: "var(--accent)" }}>
              Edit
            </Link>
            <button
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--danger)" }}
              onClick={() => remove(d.id)}
            >
              Remove
            </button>
          </span>,
        ])}
      />
    </div>
  );
}
