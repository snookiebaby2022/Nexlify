"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import { ADDON_LICENSE_SERVICES } from "@/lib/addon-license-services";

type Row = { id: string; service: string; label: string; expiresAt: string | null };

export default function AddonLicenseRenewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [id, setId] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/addon-licenses")
      .then((r) => r.json())
      .then((d) => setRows(d.licenses ?? []));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) {
      setMsg("Select a license to renew");
      return;
    }
    const res = await fetch("/api/admin/addon-licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "renew",
        id,
        licenseKey: licenseKey || undefined,
        expiresAt: expiresAt || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    window.location.href = "/admin/license/addon";
  }

  const serviceLabel = (s: string) =>
    ADDON_LICENSE_SERVICES.find((x) => x.id === s)?.label ?? s;

  return (
    <FormPageShell title="Renew Addon License" manageHref="/admin/license/addon" manageLabel="Show All">
      <form onSubmit={submit} className="space-y-4 max-w-lg">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Update the API key and/or expiry for an existing music or integration license.
        </p>
        <label className="block text-sm">
          <span style={{ color: "var(--muted)" }}>License to renew</span>
          <select
            className="panel-select mt-1 w-full rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {serviceLabel(r.service)} — {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span style={{ color: "var(--muted)" }}>New API key (optional)</span>
          <textarea
            className="mt-1 w-full min-h-[80px] font-mono text-xs rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span style={{ color: "var(--muted)" }}>New expiry (optional)</span>
          <input
            type="datetime-local"
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-positive rounded px-4 py-2 text-sm cursor-pointer">
          Renew addon license
        </button>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
        <Link href="/admin/license/addon" className="text-sm link-back inline-block">
          ← Addon licenses
        </Link>
      </form>
    </FormPageShell>
  );
}
