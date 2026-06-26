"use client";

import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import { PanelLicenseKeyForm } from "@/components/panel-license-key-form";
import { usePanelLicenseStatus, PanelLicenseStatusCard } from "@/components/panel-license-status";

export default function LicenseRenewPage() {
  const { status, load, onTrialOnly, isLicensed } = usePanelLicenseStatus();

  return (
    <FormPageShell title="Renew License" manageHref="/admin/license/show" manageLabel="Show License">
      <div className="space-y-6 max-w-2xl">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Paste a new key from your vendor to extend or replace the current panel license. The new
          expiry date applies after successful activation.
        </p>
        <PanelLicenseStatusCard status={status} isLicensed={isLicensed} onTrialOnly={onTrialOnly} />
        {status?.expiresAt && isLicensed && (
          <p className="text-sm">
            <strong>Current expiry:</strong> {new Date(status.expiresAt).toLocaleString()}
          </p>
        )}
        <PanelLicenseKeyForm
          submitLabel="Renew license"
          hint="Use the renewal key from your invoice. Replaces the stored license when valid."
          onSuccess={() => {
            load();
            window.location.assign("/admin/license/show");
          }}
        />
        <Link href="/admin/license/add" className="text-sm underline" style={{ color: "var(--accent)" }}>
          ← Add license (first time)
        </Link>
      </div>
    </FormPageShell>
  );
}
