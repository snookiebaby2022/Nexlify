"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { DevicePortalBanner } from "@/components/device-portal-banner";
import { subscriptionPaths } from "@/lib/panel-paths";

export default function AdminMagAllPage() {
  const pathname = usePathname();
  const paths = subscriptionPaths(pathname);

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

  async function remove(id: string) {
    if (!confirm("Remove this MAG device? The linked line stays active.")) return;
    const res = await fetch(`/api/admin/mag?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Remove failed");
      return;
    }
    load();
  }

  async function convertToLine(id: string, mac: string) {
    if (
      !confirm(
        `Convert MAG ${mac} to a regular line? The MAC binding will be removed; the subscription stays active for M3U / Xtream.`
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/mag/convert-to-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Convert failed");
      return;
    }
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">MAG devices</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Registered by MAC address only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${paths.magAdd}?package=1`} className="text-sm px-3 py-2 rounded-md btn-positive">
            + Add MAG (with package)
          </Link>
          <Link href={paths.magAdd} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: "var(--border)" }}>
            + Add MAG
          </Link>
          <Link href={paths.magBulk} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: "var(--border)" }}>
            Bulk add
          </Link>
          <Link href={paths.magConvert} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: "var(--border)" }}>
            Convert to line
          </Link>
        </div>
      </div>

      <DevicePortalBanner deviceKind="mag" settingsHref={paths.isReseller ? null : "/admin/settings/server"} />

      <DataTable
        headers={["MAC", "Line", "Status", ""]}
        rows={devices.map((d) => [
          d.mac,
          d.line.username,
          d.isActive ? "Active" : "Off",
          <span key={d.id} className="flex gap-2">
            {paths.magEdit(d.id) && (
              <Link href={paths.magEdit(d.id)!} className="text-xs" style={{ color: "var(--accent)" }}>
                Edit
              </Link>
            )}
            <button
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--accent)" }}
              onClick={() => convertToLine(d.id, d.mac)}
            >
              To line
            </button>
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
