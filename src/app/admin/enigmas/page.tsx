"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { DevicePortalBanner } from "@/components/device-portal-banner";
import { subscriptionPaths } from "@/lib/panel-paths";

export default function AdminEnigmasPage() {
  const pathname = usePathname();
  const paths = subscriptionPaths(pathname);

  const [devices, setDevices] = useState<
    { id: string; mac: string; model: string | null; isActive: boolean; line: { username: string } }[]
  >([]);

  function load() {
    fetch("/api/admin/enigma")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices));
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Remove this Enigma device? The linked line stays active.")) return;
    const res = await fetch(`/api/admin/enigma?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Remove failed");
      return;
    }
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Enigma2 devices</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Devices are registered by MAC address only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${paths.enigmaAdd}?package=1`} className="text-sm px-3 py-2 rounded-md btn-positive">
            + Add Enigma2 (with package)
          </Link>
          <Link href={paths.enigmaAdd} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: "var(--border)" }}>
            + Add Enigma2
          </Link>
          {paths.enigmaBulk && (
            <Link href={paths.enigmaBulk} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: "var(--border)" }}>
              Bulk add
            </Link>
          )}
          {!paths.isReseller && (
            <Link href={paths.magList} className="text-sm" style={{ color: "var(--accent)" }}>
              MAG devices →
            </Link>
          )}
        </div>
      </div>

      <DevicePortalBanner deviceKind="enigma" settingsHref={paths.isReseller ? null : "/admin/settings/server"} />

      <DataTable
        headers={["MAC", "Line", "Status", ""]}
        rows={devices.map((d) => [
          d.mac,
          d.line.username,
          d.isActive ? "Active" : "Off",
          <span key={d.id} className="flex gap-2">
            {paths.enigmaEdit(d.id) && (
              <Link href={paths.enigmaEdit(d.id)!} className="text-xs" style={{ color: "var(--accent)" }}>
                Edit
              </Link>
            )}
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
