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

export default function AdminEnigmasPage() {
  const pathname = usePathname();
  const paths = subscriptionPaths(pathname);

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [renewTarget, setRenewTarget] = useState<DeviceRow | null>(null);

  function load() {
    fetch("/api/admin/enigma")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices ?? []));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
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

  const lineEditHref = (lineId: string) =>
    paths.isReseller ? `${paths.lines}?edit=${lineId}` : `/admin/lines?edit=${lineId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Enigma2 devices</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Registered by MAC address. Renew extends the linked line subscription.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={paths.enigmaAdd} className="text-sm px-3 py-2 rounded-md btn-positive">
            + Add Enigma2 device
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
        headers={["MAC", "Line", "Expires", "Status", ""]}
        rows={devices.map((d) => [
          d.mac,
          d.line.username,
          formatDateTime(d.line.expiresAt),
          [d.isActive ? "Device on" : "Device off", d.line.status].join(" · "),
          <span key={d.id} className="flex flex-wrap gap-2">
            {paths.enigmaEdit(d.id) && (
              <Link href={paths.enigmaEdit(d.id)!} className="text-xs" style={{ color: "var(--accent)" }}>
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
