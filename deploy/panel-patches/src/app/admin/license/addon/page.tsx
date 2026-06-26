"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import { ADDON_LICENSE_SERVICES } from "@/lib/addon-license-services";
import { formatDateTime } from "@/lib/format";

type Row = {
  id: string;
  service: string;
  label: string;
  licenseKey: string | null;
  expiresAt: string | null;
  isActive: boolean;
  notes: string | null;
};

export default function AddonLicensesPage() {
  const [rows, setRows] = useState<Row[]>([]);

  function load() {
    fetch("/api/admin/addon-licenses")
      .then((r) => r.json())
      .then((d) => setRows(d.licenses ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this addon license?")) return;
    await fetch(`/api/admin/addon-licenses?id=${id}`, { method: "DELETE" });
    load();
  }

  const serviceLabel = (id: string) =>
    ADDON_LICENSE_SERVICES.find((s) => s.id === id)?.label ?? id;

  return (
    <FormPageShell title="Addon Licenses" manageHref="/admin/license/addon/add" manageLabel="Add License">
      <div className="space-y-6">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          API keys and subscription licenses for music addons (Spotify, Apple Music, Deezer, YouTube
          Music) and other integrations.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/license/addon/add" className="btn-positive rounded px-4 py-2">
            Add addon license
          </Link>
          <Link
            href="/admin/license/addon/renew"
            className="rounded px-4 py-2 border"
            style={{ borderColor: "var(--border)" }}
          >
            Renew addon license
          </Link>
        </div>
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-card)" }}>
              <tr>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>
                  Service
                </th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>
                  Label
                </th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>
                  Expires
                </th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No addon licenses yet
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">{serviceLabel(r.service)}</td>
                    <td className="px-4 py-3">{r.label}</td>
                    <td className="px-4 py-3">
                      {r.expiresAt ? formatDateTime(r.expiresAt) : "—"}
                    </td>
                    <td className="px-4 py-3">{r.isActive ? "Active" : "Off"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-xs"
                        style={{ color: "var(--danger)" }}
                        onClick={() => remove(r.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </FormPageShell>
  );
}
