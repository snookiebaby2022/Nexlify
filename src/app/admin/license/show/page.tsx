"use client";

import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import {
  PanelLicenseStatusCard,
  usePanelLicenseStatus,
} from "@/components/panel-license-status";

export default function LicenseShowPage() {
  const { status, terms, load, onTrialOnly, isLicensed } = usePanelLicenseStatus();
  const canEnter = Boolean(status?.valid);

  async function enterPanel() {
    const res = await fetch("/api/license/enter-panel", { method: "POST", credentials: "include" });
    if (res.ok) window.location.assign("/admin/dashboard");
    else {
      const data = await res.json();
      alert(data.error ?? data.hint ?? "Could not open panel");
    }
  }

  return (
    <FormPageShell title="Show License" manageHref="/admin/license/add" manageLabel="Add License">
      <div className="space-y-6 max-w-2xl">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Current Nexlify panel license status (paid key or trial).
        </p>
        <PanelLicenseStatusCard status={status} isLicensed={isLicensed} onTrialOnly={onTrialOnly} />
        {terms.length > 0 && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            <strong>Plans:</strong> {terms.map((t) => t.label).join(" · ")}
          </p>
        )}
        {canEnter && (
          <button
            type="button"
            onClick={enterPanel}
            className="btn-positive rounded px-4 py-2 text-sm cursor-pointer"
          >
            Continue to dashboard
          </button>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/admin/license/add" className="underline" style={{ color: "var(--accent)" }}>
            Add license
          </Link>
          <Link href="/admin/license/renew" className="underline" style={{ color: "var(--accent)" }}>
            Renew license
          </Link>
          <Link href="/admin/license/addon" className="underline" style={{ color: "var(--accent)" }}>
            Addon licenses (music)
          </Link>
        </div>
        <button type="button" className="text-xs underline" onClick={load} style={{ color: "var(--muted)" }}>
          Refresh status
        </button>
      </div>
    </FormPageShell>
  );
}
