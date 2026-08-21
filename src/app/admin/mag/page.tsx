"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { DevicePortalBanner } from "@/components/device-portal-banner";
import { DeviceRenewModal } from "@/components/device-renew-modal";
import { formatDateTime } from "@/lib/format";
import { subscriptionPaths } from "@/lib/panel-paths";

type DeviceRow = {
  id: string;
  mac: string;
  model: string | null;
  isActive: boolean;
  line: { id: string; username: string; status: string; expiresAt: string };
};

export default function AdminMagAllPage() {
  const pathname = usePathname();
  const paths = subscriptionPaths(pathname);

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [renewTarget, setRenewTarget] = useState<DeviceRow | null>(null);

  function load() {
    fetch("/api/admin/mag")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices ?? []));
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

  const lineEditHref = (lineId: string) =>
    paths.isReseller ? `${paths.lines}?edit=${lineId}` : `/admin/lines?edit=${lineId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">MAG devices</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Registered by MAC address. Renew extends the linked line subscription.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={paths.magAdd} className="text-sm px-3 py-2 rounded-md btn-positive">
            + Add MAG device
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
        headers={["MAC", "Line", "Expires", "Status", ""]}
        rows={devices.map((d) => [
          d.mac,
          d.line.username,
          formatDateTime(d.line.expiresAt),
          [d.isActive ? "Device on" : "Device off", d.line.status].join(" · "),
          <span key={d.id} className="flex flex-wrap gap-2">
            {paths.magEdit(d.id) && (
              <Link href={paths.magEdit(d.id)!} className="text-xs" style={{ color: "var(--accent)" }}>
                Edit
              </Link>
            )}
            <button
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--accent)" }}
              onClick={() => setRenewTarget(d)}
            >
              Renew
            </button>
            <Link href={lineEditHref(d.line.id)} className="text-xs" style={{ color: "var(--accent)" }}>
              Line
            </Link>
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

      {renewTarget && (
        <DeviceRenewModal
          open
          lineId={renewTarget.line.id}
          lineUsername={renewTarget.line.username}
          expiresAt={renewTarget.line.expiresAt}
          onClose={() => setRenewTarget(null)}
          onRenewed={load}
        />
      )}
    </div>
  );
}
